import { describe, expect, it } from 'vitest';
import type { ChatRequest } from '../../contracts/internal.js';
import type { Ports } from '../../contracts/seams.js';
import { createDevPorts } from '../../api/dev-stubs.js';
import {
  DEFAULT_MODELS, FairLimiter, chat as sharedChat, createFeatherlessClient, readFeatherlessConfig,
  type FeatherlessConfig, type LogEvent,
} from '../../llm/featherless.js';
import { runSmoke } from '../../llm/smoke.js';

// Compile-time proof: the export is exactly Ports['chat'] and can be wired as-is.
const wired: Ports = { ...createDevPorts(), chat: sharedChat };
void wired;

const KEY = 'sk-test-SECRET-KEY-123';
const GEN = DEFAULT_MODELS.generation;
const ASSIST = DEFAULT_MODELS.assistant;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const reply = (content = 'hello', model = GEN) =>
  json({ model, choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 7, completion_tokens: 3 } });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const ctx = (signal: AbortSignal = AbortSignal.timeout(10_000)) => ({ signal });
const request = (purpose: ChatRequest['purpose'] = 'generation', extra: Partial<ChatRequest> = {}): ChatRequest =>
  ({ purpose, model: 'default', max_tokens: 64, messages: [{ role: 'user', content: 'hi' }], ...extra });

type ChatHandler = (body: { model: string; messages: unknown; max_tokens: number }, signal: AbortSignal, call: number) => Promise<Response> | Response;
function harness(options: {
  chat?: ChatHandler; plan?: number | 'fail'; costs?: Record<string, number>; config?: Partial<FeatherlessConfig>; apiKey?: string | undefined;
} = {}) {
  const urls: string[] = [];
  const bodies: { model: string; messages: unknown; max_tokens: number }[] = [];
  const logs: LogEvent[] = [];
  const sleeps: number[] = [];
  const headersSeen: string[] = [];
  let chatCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    urls.push(url);
    headersSeen.push(JSON.stringify(init.headers ?? {}));
    if (url.endsWith('/plan')) {
      return options.plan === 'fail' ? json({ error: 'down' }, 500) : json({ concurrency: options.plan ?? 100, credits: '25.0' });
    }
    if (url.includes('/models/')) {
      const id = decodeURIComponent(url.split('/models/')[1]!);
      return json({ id, concurrency_cost: options.costs?.[id] ?? 1, available_on_current_plan: true });
    }
    chatCalls += 1;
    const body = JSON.parse(String(init.body)) as { model: string; messages: unknown; max_tokens: number };
    bodies.push(body);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const signal = init.signal!;
    try {
      const handler = options.chat ?? (() => reply());
      // Like real fetch: an abort rejects the pending request.
      return await new Promise<Response>((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        Promise.resolve(handler(body, signal, chatCalls)).then(resolve, reject);
      });
    } finally { inFlight -= 1; }
  }) as typeof fetch;
  const config: FeatherlessConfig = { ...readFeatherlessConfig({}), apiKey: 'apiKey' in options ? options.apiKey : KEY, ...options.config };
  const client = createFeatherlessClient(config, {
    fetch: fakeFetch, log: event => logs.push(event), random: () => 0.5,
    sleep: async (ms, signal) => { signal.throwIfAborted(); sleeps.push(ms); },
  });
  return { client, urls, bodies, logs, sleeps, headersSeen, stats: () => ({ chatCalls, maxInFlight }) };
}

describe('model routing and contract shape', () => {
  it('routes generation and assistant to their configured models and returns exactly {content, model}', async () => {
    const h = harness({ chat: body => reply(`from ${body.model}`, body.model) });
    const generation = await h.client.chat(request('generation'), ctx());
    const assistant = await h.client.chat(request('assistant'), ctx());
    expect(generation).toEqual({ kind: 'ok', value: { content: `from ${GEN}`, model: GEN } });
    expect(assistant).toEqual({ kind: 'ok', value: { content: `from ${ASSIST}`, model: ASSIST } });
    expect(h.bodies.map(body => body.model)).toEqual([GEN, ASSIST]);
    expect(h.urls.every(url => url.startsWith('https://api.featherless.ai/v1/'))).toBe(true);
  });

  it('honours env model overrides and accepts the exact configured id', async () => {
    const config = readFeatherlessConfig({ FEATHERLESS_API_KEY: KEY, FEATHERLESS_MODEL_ASSISTANT: 'acme/small-7b' });
    expect(config.models).toEqual({ generation: GEN, assistant: 'acme/small-7b' });
    const h = harness({ config: { models: config.models } });
    expect((await h.client.chat(request('assistant', { model: 'acme/small-7b' }), ctx())).kind).toBe('ok');
    expect(h.bodies[0]!.model).toBe('acme/small-7b');
  });
});

describe('rejections before any network call', () => {
  it.each<[string, Partial<ChatRequest>]>([
    ['unapproved model', { model: 'meta-llama/Llama-3.3-70B-Instruct' }],
    ['other purpose model', { model: ASSIST }],
    ['zero max_tokens', { max_tokens: 0 }],
    ['oversized max_tokens', { max_tokens: 100_000 }],
    ['fractional max_tokens', { max_tokens: 1.5 }],
    ['no messages', { messages: [] }],
    ['empty content', { messages: [{ role: 'user', content: '' }] }],
    ['bad role', { messages: [{ role: 'tool' as 'user', content: 'x' }] }],
    ['oversized prompt', { messages: [{ role: 'user', content: 'x'.repeat(48_001) }] }],
    ['bad purpose', { purpose: 'judge' as 'generation' }],
  ])('rejects %s as invalid_request', async (_name, change) => {
    const h = harness();
    expect(await h.client.chat(request('generation', change), ctx()))
      .toEqual({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: 'LLM unavailable: invalid_request' });
    expect(h.urls).toEqual([]);
  });

  it('missing credentials: not_configured and the provider is never contacted', async () => {
    const h = harness({ apiKey: undefined });
    expect(await h.client.chat(request(), ctx())).toMatchObject({ kind: 'unavailable', message: 'LLM unavailable: not_configured' });
    expect(h.urls).toEqual([]);
    expect(readFeatherlessConfig({}).apiKey).toBeUndefined();
    expect(readFeatherlessConfig({ FEATHERLESS_API_KEY: '  ' }).apiKey).toBeUndefined();
  });
});

describe('provider responses, retries and timeouts', () => {
  it.each([
    ['no choices', () => json({ model: GEN })],
    ['empty content', () => reply('   ')],
    ['non-string content', () => json({ choices: [{ message: { content: 42 } }] })],
    ['invalid JSON', () => new Response('not json', { status: 200 })],
  ])('%s is malformed_response, never a fake success, and is not retried', async (_name, handler) => {
    const h = harness({ chat: handler });
    expect(await h.client.chat(request(), ctx())).toMatchObject({ kind: 'unavailable', message: 'LLM unavailable: malformed_response' });
    expect(h.stats().chatCalls).toBe(1);
  });

  it('429 honours Retry-After, then succeeds', async () => {
    const h = harness({ chat: (_b, _s, call) => call === 1 ? json({}, 429, { 'retry-after': '2' }) : reply('ok') });
    expect(await h.client.chat(request(), ctx())).toMatchObject({ kind: 'ok', value: { content: 'ok' } });
    expect(h.sleeps).toEqual([2000]);
    expect(h.logs.at(-1)).toMatchObject({ outcome: 'ok', attempts: 2 });
  });

  it('429 gives up after 3 attempts, and does not wait for a Retry-After beyond the cap', async () => {
    const always = harness({ chat: () => json({}, 429) });
    expect(await always.client.chat(request(), ctx())).toMatchObject({ message: 'LLM unavailable: rate_limited' });
    expect(always.stats().chatCalls).toBe(3);
    expect(always.sleeps).toEqual([375, 750]); // jittered exponential backoff (random = 0.5)
    const long = harness({ chat: () => json({}, 429, { 'retry-after': '120' }) });
    expect(await long.client.chat(request(), ctx())).toMatchObject({ message: 'LLM unavailable: rate_limited' });
    expect(long.stats().chatCalls).toBe(1);
  });

  it('retries transient 5xx and recovers', async () => {
    const h = harness({ chat: (_b, _s, call) => call < 3 ? json({}, call === 1 ? 503 : 502) : reply('back') });
    expect(await h.client.chat(request(), ctx())).toMatchObject({ kind: 'ok', value: { content: 'back' } });
    expect(h.stats().chatCalls).toBe(3);
  });

  it.each([[401, 'auth'], [403, 'forbidden'], [404, 'model_unavailable'], [400, 'invalid_request']])('HTTP %i is %s and never retried', async (status, category) => {
    const h = harness({ chat: () => json({ error: 'secret provider detail' }, status) });
    const result = await h.client.chat(request(), ctx());
    expect(result).toEqual({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: `LLM unavailable: ${category}` });
    expect(h.stats().chatCalls).toBe(1);
    expect(h.sleeps).toEqual([]);
  });

  it('request timeout is reported as timeout, not retried, and releases capacity', async () => {
    const h = harness({ chat: () => new Promise<Response>(() => {}), config: { requestTimeoutMs: 50 } });
    expect(await h.client.chat(request(), ctx())).toMatchObject({ message: 'LLM unavailable: timeout' });
    expect(h.stats().chatCalls).toBe(1);
    expect(h.client.limiter.stats()).toEqual({ inFlight: 0, usedUnits: 0, queued: 0 });
  });
});

describe('shared queue, concurrency and cancellation', () => {
  it('never exceeds the app concurrency cap under load', async () => {
    const gates: ReturnType<typeof deferred<Response>>[] = [];
    const h = harness({ chat: () => { const gate = deferred<Response>(); gates.push(gate); return gate.promise; } });
    const all = Array.from({ length: 6 }, (_, i) => h.client.chat(request(i % 2 ? 'assistant' : 'generation'), ctx()));
    for (let released = 0; released < 6; released++) {
      while (gates.length <= released) await tick();
      await tick();
      expect(h.client.limiter.stats().inFlight).toBeLessThanOrEqual(2);
      gates[released]!.resolve(reply());
    }
    expect((await Promise.all(all)).every(result => result.kind === 'ok')).toBe(true);
    expect(h.stats().maxInFlight).toBe(2);
    expect(h.client.limiter.stats()).toEqual({ inFlight: 0, usedUnits: 0, queued: 0 });
  });

  it('accounts weighted model costs against plan units', async () => {
    // Plan of 3 units, app cap 4 requests: generation costs 2, assistant 1.
    const gates: ReturnType<typeof deferred<Response>>[] = [];
    const units: number[] = [];
    const h = harness({ plan: 3, costs: { [GEN]: 2, [ASSIST]: 1 }, config: { maxConcurrency: 4 },
      chat: () => { const gate = deferred<Response>(); gates.push(gate); return gate.promise; } });
    const results = [request('generation'), request('assistant'), request('generation'), request('assistant')].map(r => h.client.chat(r, ctx()));
    while (gates.length < 2) await tick();
    await tick();
    expect(h.client.limiter.stats()).toEqual({ inFlight: 2, usedUnits: 3, queued: 2 });
    // Drain: release whatever is running, sampling the units in use each step.
    let settled = false;
    const done = Promise.all(results).finally(() => { settled = true; });
    while (!settled) {
      units.push(h.client.limiter.stats().usedUnits);
      gates.forEach(gate => gate.resolve(reply()));
      await tick();
    }
    expect((await done).every(result => result.kind === 'ok')).toBe(true);
    expect(gates).toHaveLength(4);
    expect(Math.max(...units)).toBeLessThanOrEqual(3);
    expect(h.client.limiter.stats()).toEqual({ inFlight: 0, usedUnits: 0, queued: 0 });
  });

  it('rejects immediately with queue_full when the bounded queue is saturated', async () => {
    const gate = deferred<Response>();
    const h = harness({ config: { maxConcurrency: 1, maxQueue: 2 }, chat: () => gate.promise });
    const running = [h.client.chat(request(), ctx()), h.client.chat(request(), ctx()), h.client.chat(request(), ctx())];
    while (h.client.limiter.stats().queued < 2) await tick();
    expect(await h.client.chat(request(), ctx())).toMatchObject({ kind: 'unavailable', message: 'LLM unavailable: queue_full' });
    gate.resolve(reply());
    // Each queued call gets its own (resolved) response object.
    await Promise.all(running);
  });

  it('cancels a queued request without leaking capacity', async () => {
    const gate = deferred<Response>();
    const h = harness({ config: { maxConcurrency: 1 }, chat: (_b, _s, call) => call === 1 ? gate.promise : reply() });
    const first = h.client.chat(request(), ctx());
    const controller = new AbortController();
    const queued = h.client.chat(request('assistant'), ctx(controller.signal));
    while (h.client.limiter.stats().queued < 1) await tick();
    controller.abort(new Error('candidate left'));
    await expect(queued).rejects.toThrow('candidate left');
    expect(h.client.limiter.stats()).toEqual({ inFlight: 1, usedUnits: 1, queued: 0 });
    gate.resolve(reply());
    expect((await first).kind).toBe('ok');
    expect((await h.client.chat(request(), ctx())).kind).toBe('ok');
    expect(h.stats().chatCalls).toBe(2); // the cancelled request never reached the provider
    expect(h.client.limiter.stats()).toEqual({ inFlight: 0, usedUnits: 0, queued: 0 });
  });

  it('cancels an executing request: aborts the HTTP call and releases capacity', async () => {
    let providerSignal: AbortSignal | undefined;
    const h = harness({ chat: (_b, signal) => { providerSignal = signal; return new Promise<Response>(() => {}); } });
    const controller = new AbortController();
    const pending = h.client.chat(request(), ctx(controller.signal));
    while (!providerSignal) await tick();
    controller.abort(new Error('request cancelled'));
    await expect(pending).rejects.toThrow('request cancelled');
    expect(providerSignal.aborted).toBe(true);
    expect(h.client.limiter.stats()).toEqual({ inFlight: 0, usedUnits: 0, queued: 0 });
    expect(h.logs.at(-1)).toMatchObject({ outcome: 'aborted' });
  });

  it('releases capacity after provider errors', async () => {
    const h = harness({ chat: () => json({}, 401) });
    await Promise.all([h.client.chat(request(), ctx()), h.client.chat(request('assistant'), ctx()), h.client.chat(request(), ctx())]);
    expect(h.client.limiter.stats()).toEqual({ inFlight: 0, usedUnits: 0, queued: 0 });
  });

  it('alternates generation and assistant under mixed load (no starvation)', async () => {
    const gates: ReturnType<typeof deferred<Response>>[] = [];
    const h = harness({ config: { maxConcurrency: 1 }, chat: () => { const gate = deferred<Response>(); gates.push(gate); return gate.promise; } });
    const all = [h.client.chat(request('generation'), ctx())];
    while (gates.length < 1) await tick();
    for (let i = 0; i < 3; i++) all.push(h.client.chat(request('generation'), ctx()));
    for (let i = 0; i < 3; i++) all.push(h.client.chat(request('assistant'), ctx()));
    while (h.client.limiter.stats().queued < 6) await tick();
    for (let i = 0; i < 7; i++) {
      while (gates.length <= i) await tick();
      gates[i]!.resolve(reply());
    }
    await Promise.all(all);
    expect(h.bodies.map(body => (body.model === GEN ? 'g' : 'a')).join('')).toBe('gagagag');
  });

  it('plan endpoint failure falls back to one request at a time; plan and model metadata are fetched once', async () => {
    const failing = harness({ plan: 'fail', chat: async () => { await tick(); return reply(); } });
    await Promise.all(Array.from({ length: 4 }, () => failing.client.chat(request(), ctx())));
    expect(failing.stats().maxInFlight).toBe(1);
    expect(failing.client.limiter.limits()).toEqual({ maxInFlight: 1, units: Number.POSITIVE_INFINITY });
    expect(failing.logs.find(log => log.event === 'featherless_plan')).toMatchObject({ outcome: 'fallback', max_in_flight: 1 });

    const healthy = harness();
    await Promise.all([healthy.client.chat(request(), ctx()), healthy.client.chat(request(), ctx()), healthy.client.chat(request('assistant'), ctx())]);
    expect(healthy.urls.filter(url => url.endsWith('/plan'))).toHaveLength(1);
    expect(healthy.urls.filter(url => url.includes('/models/'))).toHaveLength(2);
    expect(healthy.urls.some(url => url.endsWith('/models'))).toBe(false); // never the 8 MB catalog
    expect(healthy.client.limiter.limits()).toEqual({ maxInFlight: 2, units: 100 });
  });

  it('a request costing more than the plan allows is refused, not queued forever', async () => {
    const h = harness({ plan: 1, costs: { [GEN]: 2 } });
    expect(await h.client.chat(request(), ctx())).toMatchObject({ message: 'LLM unavailable: over_capacity' });
    expect(h.stats().chatCalls).toBe(0);
  });

  it('FairLimiter rejects an already-aborted acquire', async () => {
    const limiter = new FairLimiter(4);
    expect(() => limiter.acquire('generation', 1, AbortSignal.abort(new Error('gone')), 1000)).toThrow('gone');
  });
});

describe('logging confidentiality and smoke command', () => {
  it('logs metadata only: no key, prompt, candidate code or reply', async () => {
    const h = harness({ chat: () => reply('MODEL-REPLY-XYZ the full solution is ...') });
    await h.client.chat(request('assistant', { messages: [
      { role: 'system', content: 'TOP-SECRET-SYSTEM-PROMPT reference: def solve(): return 42' },
      { role: 'user', content: 'my code: def candidate_code(): pass  # hidden test test_hidden_case' },
    ] }), ctx());
    await h.client.chat(request('generation'), ctx());
    const logged = JSON.stringify(h.logs);
    for (const secret of [KEY, 'TOP-SECRET', 'def solve', 'candidate_code', 'test_hidden_case', 'MODEL-REPLY', 'Bearer']) {
      expect(logged).not.toContain(secret);
    }
    expect(h.logs.find(log => log.event === 'featherless_chat' && log.purpose === 'assistant')).toMatchObject({
      outcome: 'ok', model: ASSIST, attempts: 1, prompt_tokens: 7, completion_tokens: 3,
      latency_ms: expect.any(Number), queue_wait_ms: expect.any(Number), request_id: expect.any(String),
    });
    // The key is only ever sent as the Authorization header to Featherless.
    expect(h.headersSeen.every(headers => headers.includes(`Bearer ${KEY}`))).toBe(true);
    // Featherless 404s model metadata for Node's default "node" User-Agent.
    expect(h.headersSeen.every(headers => headers.includes('"User-Agent":"torquecode-backend/0.1"'))).toBe(true);
  });

  it('smoke command makes one call and reports model, latency and a non-empty reply', async () => {
    const urls: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      urls.push(String(input));
      if (String(input).endsWith('/plan')) return json({ concurrency: 100 });
      if (String(input).includes('/models/')) return json({ concurrency_cost: 1, available_on_current_plan: true });
      return reply('ready', ASSIST);
    }) as typeof fetch;
    const outcome = await runSmoke('assistant', { FEATHERLESS_API_KEY: KEY }, { fetch: fakeFetch, log: () => {} });
    expect(outcome).toMatchObject({ ok: true, model: ASSIST, reply_chars: 5 });
    expect(urls.filter(url => url.endsWith('/chat/completions'))).toHaveLength(1);
    expect(await runSmoke('assistant', {}, { fetch: fakeFetch, log: () => {} })).toMatchObject({ ok: false, error: 'LLM unavailable: not_configured' });
  });
});
