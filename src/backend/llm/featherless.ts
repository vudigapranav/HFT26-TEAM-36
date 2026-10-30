// The only module that talks to Featherless (R4). Implements Ports['chat'].
//
// - One shared, weighted, fair queue for every chat completion in the process.
// - Plan limits (/v1/plan) and per-model concurrency cost (/v1/models/{id}) are
//   read lazily on first use and cached; unknown plan => one request at a time.
// - Retries only 429 / transient 5xx / network errors, max 3 attempts, with
//   jittered backoff honouring Retry-After. Never fabricates a reply.
// - Logs metadata only: no key, prompts, candidate code or model output.
import { randomUUID } from 'node:crypto';
import type { ChatRequest, Context, SeamResult } from '../contracts/internal.js';

export type Purpose = ChatRequest['purpose'];
export type ChatValue = { content: string; model: string };
export type Category =
  | 'not_configured' | 'invalid_request' | 'over_capacity' | 'queue_full' | 'queue_timeout'
  | 'auth' | 'forbidden' | 'model_unavailable' | 'rate_limited' | 'provider_error'
  | 'timeout' | 'network' | 'malformed_response';

export class FeatherlessError extends Error {
  constructor(readonly category: Category, message: string, readonly status?: number) { super(message); }
}

export type FeatherlessConfig = {
  apiKey: string | undefined;
  baseUrl: string;
  models: Record<Purpose, string>;
  /** App-level cap on in-flight chat requests (also bounded by plan units). */
  maxConcurrency: number;
  maxQueue: number;
  requestTimeoutMs: number;
  queueTimeoutMs: number;
  metadataTimeoutMs: number;
  maxAttempts: number;
  maxOutputTokens: Record<Purpose, number>;
  maxInputChars: number;
};

/** Provisional choices measured in R0 (docs/status/rithvik.md). TODO(OPEN-Q9): team to freeze. */
export const DEFAULT_MODELS: Record<Purpose, string> = {
  generation: 'Qwen/Qwen3-Coder-30B-A3B-Instruct',
  assistant: 'Qwen/Qwen3-30B-A3B-Instruct-2507',
};
/** Callers that don't care which concrete model serves a purpose pass this. */
export const DEFAULT_MODEL_ALIAS = 'default';
// Unknown model cost: assume the largest class (70B+ = 4 units) so we never oversubscribe.
const CONSERVATIVE_COST = 4;
const METADATA_RETRY_MS = 60_000;
const METADATA_FRESH_MS = 10 * 60_000;
const RESPONSE_MAX_BYTES = 2 * 1_048_576;
const METADATA_MAX_BYTES = 262_144;
const MAX_RETRY_AFTER_MS = 20_000;

const int = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`Featherless config out of range: ${value}`);
  return parsed;
};

export function readFeatherlessConfig(env: NodeJS.ProcessEnv = process.env): FeatherlessConfig {
  return {
    apiKey: env.FEATHERLESS_API_KEY?.trim() || undefined,
    baseUrl: 'https://api.featherless.ai/v1',
    models: {
      generation: env.FEATHERLESS_MODEL_GENERATION?.trim() || DEFAULT_MODELS.generation,
      assistant: env.FEATHERLESS_MODEL_ASSISTANT?.trim() || DEFAULT_MODELS.assistant,
    },
    maxConcurrency: int(env.FEATHERLESS_MAX_CONCURRENCY, 2, 1, 16),
    maxQueue: int(env.FEATHERLESS_MAX_QUEUE, 16, 0, 256),
    // End-to-end bound per chat call (metadata + queue + attempts + backoff).
    requestTimeoutMs: int(env.FEATHERLESS_TIMEOUT_MS, 120_000, 100, 300_000),
    queueTimeoutMs: 30_000,
    metadataTimeoutMs: 5_000,
    maxAttempts: 3,
    maxOutputTokens: { generation: 4096, assistant: 1024 },
    // ~12k tokens; both models have >= 32k context.
    maxInputChars: 48_000,
  };
}

export type LogEvent = Record<string, string | number | boolean | null>;
export type FeatherlessDeps = {
  fetch?: typeof fetch;
  log?: (event: LogEvent) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const abortableSleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
  signal.addEventListener('abort', onAbort, { once: true });
});

/** Shared weighted semaphore with one FIFO per purpose, granted round-robin (no starvation, no bypass). */
export class FairLimiter {
  private maxInFlight = 1;
  private units = Number.POSITIVE_INFINITY;
  private inFlight = 0;
  private usedUnits = 0;
  private turn: Purpose = 'generation';
  private readonly queues: Record<Purpose, { cost: number; grant: () => void }[]> = { generation: [], assistant: [] };
  constructor(private readonly maxQueue: number) {}

  setLimits(maxInFlight: number, units: number) { this.maxInFlight = maxInFlight; this.units = units; this.pump(); }
  limits() { return { maxInFlight: this.maxInFlight, units: this.units }; }
  stats() { return { inFlight: this.inFlight, usedUnits: this.usedUnits, queued: this.queues.generation.length + this.queues.assistant.length }; }

  acquire(purpose: Purpose, cost: number, signal: AbortSignal, timeoutMs: number): Promise<() => void> {
    signal.throwIfAborted();
    if (cost > this.units) return Promise.reject(new FeatherlessError('over_capacity', 'Model cost exceeds plan concurrency'));
    const queued = this.stats().queued;
    const immediate = queued === 0 && this.fits(cost);
    if (!immediate && queued >= this.maxQueue) return Promise.reject(new FeatherlessError('queue_full', 'LLM queue is full'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const release = () => {
        if (settled) return;
        settled = true;
        this.inFlight -= 1;
        this.usedUnits -= cost;
        this.pump();
      };
      const entry = { cost, grant: () => { cleanup(); resolve(release); } };
      const leave = (error: unknown) => {
        const queue = this.queues[purpose];
        const index = queue.indexOf(entry);
        if (index >= 0) queue.splice(index, 1);
        cleanup();
        reject(error);
        this.pump();
      };
      const onAbort = () => leave(signal.reason);
      const timer = setTimeout(() => leave(new FeatherlessError('queue_timeout', 'Timed out waiting for LLM capacity')), timeoutMs);
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); };
      signal.addEventListener('abort', onAbort, { once: true });
      this.queues[purpose].push(entry);
      this.pump();
    });
  }

  private fits(cost: number) { return this.inFlight < this.maxInFlight && this.usedUnits + cost <= this.units; }

  private pump() {
    for (;;) {
      const other: Purpose = this.turn === 'generation' ? 'assistant' : 'generation';
      const purpose = this.queues[this.turn].length > 0 ? this.turn : this.queues[other].length > 0 ? other : null;
      if (!purpose) return;
      const head = this.queues[purpose][0]!;
      // Head-of-line blocking is deliberate: a large request is never starved by small ones.
      if (!this.fits(head.cost)) return;
      this.queues[purpose].shift();
      this.inFlight += 1;
      this.usedUnits += head.cost;
      this.turn = purpose === 'generation' ? 'assistant' : 'generation';
      head.grant();
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a response body up to `limit` bytes; larger bodies are cancelled and rejected. */
async function readBounded(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new FeatherlessError('malformed_response', 'Featherless response exceeds size limit');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(text: string): unknown {
  try { return JSON.parse(text); }
  catch { throw new FeatherlessError('malformed_response', 'Featherless returned invalid JSON'); }
}

function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function classify(status: number): { category: Category; retryable: boolean } {
  if (status === 429) return { category: 'rate_limited', retryable: true };
  if (status === 401) return { category: 'auth', retryable: false };
  if (status === 403) return { category: 'forbidden', retryable: false };
  if (status === 404) return { category: 'model_unavailable', retryable: false };
  if (status === 400 || status === 413 || status === 422) return { category: 'invalid_request', retryable: false };
  if (status >= 500 && status !== 501) return { category: 'provider_error', retryable: true };
  return { category: 'provider_error', retryable: false };
}

/** Returns a reason when the request must not be sent. */
export function validateChat(input: ChatRequest, config: FeatherlessConfig): string | null {
  if (input.purpose !== 'generation' && input.purpose !== 'assistant') return 'invalid purpose';
  if (input.model !== DEFAULT_MODEL_ALIAS && input.model !== config.models[input.purpose]) {
    return `model is not approved for ${input.purpose}`;
  }
  const cap = config.maxOutputTokens[input.purpose];
  if (!Number.isInteger(input.max_tokens) || input.max_tokens < 1 || input.max_tokens > cap) return `max_tokens must be 1-${cap}`;
  if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 50) return 'expected 1-50 messages';
  let chars = 0;
  for (const message of input.messages) {
    if (!['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string') return 'invalid message';
    chars += message.content.length;
  }
  if (chars === 0) return 'messages are empty';
  if (chars > config.maxInputChars) return `messages exceed ${config.maxInputChars} characters`;
  return null;
}

export function createFeatherlessClient(config: FeatherlessConfig, deps: FeatherlessDeps = {}) {
  const fetchImpl = deps.fetch ?? fetch;
  const log = deps.log ?? (event => console.info(JSON.stringify({ scope: 'featherless', ...event })));
  const sleep = deps.sleep ?? abortableSleep;
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  const limiter = new FairLimiter(config.maxQueue);
  // Explicit User-Agent: Featherless answers GET /v1/models/{id} with 404 for Node's default "node" UA (measured).
  const headers = () => ({ Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'torquecode-backend/0.1' });

  // Metadata lookups are shared by concurrent callers, so they run on their own
  // timeout; each caller only races its own abort signal against them.
  async function getJson(path: string): Promise<unknown> {
    const response = await fetchImpl(`${config.baseUrl}${path}`, { headers: headers(), signal: AbortSignal.timeout(config.metadataTimeoutMs) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new FeatherlessError(classify(response.status).category, `GET ${path} failed`, response.status);
    }
    return parseBody(await readBounded(response, METADATA_MAX_BYTES));
  }
  const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal) => new Promise<T>((resolve, reject) => {
    // Already aborted: an 'abort' listener added now would never fire.
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });

  // Plan: cached on success; on failure stay at 1 in flight and retry after a minute.
  let planLoaded = false;
  let planPending: Promise<void> | null = null;
  let planRetryAt = 0;
  function ensurePlan(signal: AbortSignal): Promise<void> {
    if (planLoaded || now() < planRetryAt) return Promise.resolve();
    planPending ??= (async () => {
      try {
        const plan = await getJson('/plan');
        const units = isRecord(plan) && typeof plan.concurrency === 'number' && plan.concurrency > 0 ? plan.concurrency : null;
        if (units === null) throw new FeatherlessError('malformed_response', 'plan has no concurrency');
        limiter.setLimits(config.maxConcurrency, units);
        planLoaded = true;
        log({ event: 'featherless_plan', outcome: 'ok', plan_concurrency: units, max_in_flight: config.maxConcurrency });
      } catch (error) {
        limiter.setLimits(1, Number.POSITIVE_INFINITY);
        planRetryAt = now() + METADATA_RETRY_MS;
        log({ event: 'featherless_plan', outcome: 'fallback', category: error instanceof FeatherlessError ? error.category : 'network', max_in_flight: 1 });
      } finally { planPending = null; }
    })();
    return untilAborted(planPending, signal);
  }

  // Per-model cost/availability. Every entry expires, so one bad lookup never poisons a model:
  // fresh results for 10 min; failures (including a metadata 404, which a bad User-Agent once
  // produced) retry after a minute and meanwhile count as "unknown, conservative cost".
  type Cost = { cost: number; available: boolean; retryAt: number };
  const costs = new Map<string, Cost>();
  const costPending = new Map<string, Promise<Cost>>();
  function modelCost(model: string, signal: AbortSignal): Promise<Cost> {
    const cached = costs.get(model);
    if (cached && now() < cached.retryAt) return Promise.resolve(cached);
    let pending = costPending.get(model);
    if (!pending) {
      pending = (async (): Promise<Cost> => {
        let entry: Cost;
        try {
          const meta = await getJson(`/models/${model.split('/').map(encodeURIComponent).join('/')}`);
          if (!isRecord(meta)) throw new FeatherlessError('malformed_response', 'model metadata is not an object');
          const cost = typeof meta.concurrency_cost === 'number' && meta.concurrency_cost > 0 ? meta.concurrency_cost : CONSERVATIVE_COST;
          const available = meta.available_on_current_plan !== false;
          entry = { cost, available, retryAt: now() + (available ? METADATA_FRESH_MS : METADATA_RETRY_MS) };
        } catch {
          entry = { cost: CONSERVATIVE_COST, available: true, retryAt: now() + METADATA_RETRY_MS };
        }
        costs.set(model, entry);
        costPending.delete(model);
        return entry;
      })();
      costPending.set(model, pending);
    }
    return untilAborted(pending, signal);
  }

  type Attempt =
    | { value: ChatValue; usage: { prompt_tokens: number | null; completion_tokens: number | null } }
    | { error: FeatherlessError; retryable: boolean; retryAfter: number | null };
  const malformed = (message: string): Attempt => ({ error: new FeatherlessError('malformed_response', message), retryable: false, retryAfter: null });

  /** One HTTP attempt. `signal` is the caller's abort combined with the overall deadline. */
  async function attempt(model: string, input: ChatRequest, signal: AbortSignal): Promise<Attempt> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST', headers: headers(), signal,
        body: JSON.stringify({ model, messages: input.messages, max_tokens: input.max_tokens, stream: false }),
      });
    } catch {
      signal.throwIfAborted();
      return { error: new FeatherlessError('network', 'Featherless network error'), retryable: true, retryAfter: null };
    }
    if (!response.ok) {
      const { category, retryable } = classify(response.status);
      await response.body?.cancel().catch(() => {});
      return { error: new FeatherlessError(category, `Featherless HTTP ${response.status}`, response.status), retryable,
        retryAfter: retryAfterMs(response.headers.get('retry-after'), now()) };
    }
    let body: unknown;
    try { body = parseBody(await readBounded(response, RESPONSE_MAX_BYTES)); }
    catch (error) {
      signal.throwIfAborted();
      return malformed(error instanceof FeatherlessError ? error.message : 'Featherless returned an unreadable body');
    }
    // Validate the whole shape before touching nested fields: null, arrays, strings and
    // wrongly-typed members are all malformed, never an exception or a fake reply.
    if (!isRecord(body) || !Array.isArray(body.choices) || body.choices.length === 0) return malformed('Featherless reply has no choices');
    const choice: unknown = body.choices[0];
    if (!isRecord(choice) || !isRecord(choice.message)) return malformed('Featherless reply has no message');
    const content = choice.message.content;
    if (typeof content !== 'string' || content.trim() === '') return malformed('Featherless reply has no content');
    const usage = isRecord(body.usage) ? body.usage : {};
    const tokens = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    return { value: { content, model: typeof body.model === 'string' && body.model.length <= 200 ? body.model : model },
      usage: { prompt_tokens: tokens(usage.prompt_tokens), completion_tokens: tokens(usage.completion_tokens) } };
  }

  async function chat(input: ChatRequest, context: Context): Promise<SeamResult<ChatValue>> {
    const caller = context.signal;
    caller.throwIfAborted();
    const requestId = randomUUID();
    const started = now();
    const base = { event: 'featherless_chat', request_id: requestId, purpose: String(input.purpose) };
    const fail = (category: Category, extra: LogEvent = {}): SeamResult<ChatValue> => {
      log({ ...base, outcome: 'error', category, latency_ms: now() - started, ...extra });
      // Generic text only: provider details never reach the API or the browser.
      return { kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: `LLM unavailable: ${category}` };
    };

    if (!config.apiKey) return fail('not_configured');
    const invalid = validateChat(input, config);
    if (invalid) return fail('invalid_request', { reason: invalid });
    const model = config.models[input.purpose];
    const meta = { ...base, model };

    // requestTimeoutMs bounds the WHOLE call: metadata, queueing, every attempt and backoff.
    const lifetime = new AbortController();
    const deadline = started + config.requestTimeoutMs;
    const timer = setTimeout(() => lifetime.abort(new FeatherlessError('timeout', 'Featherless request timed out')), config.requestTimeoutMs);
    const signal = AbortSignal.any([caller, lifetime.signal]);
    let release: (() => void) | null = null;
    let attempts = 0;
    let queueWait = 0;
    try {
      await ensurePlan(signal);
      const { cost, available } = await modelCost(model, signal);
      if (!available) return fail('model_unavailable', { model });
      const queued = now();
      release = await limiter.acquire(input.purpose, cost, signal, config.queueTimeoutMs);
      queueWait = now() - queued;
      for (;;) {
        attempts += 1;
        const result = await attempt(model, input, signal);
        if ('value' in result) {
          log({ ...meta, outcome: 'ok', attempts, queue_wait_ms: queueWait, latency_ms: now() - started, ...result.usage });
          return { kind: 'ok', value: result.value };
        }
        const status = result.error.status ?? null;
        const wait = result.retryAfter ?? Math.min(8000, 500 * 2 ** (attempts - 1)) * (0.5 + random() * 0.5);
        if (!result.retryable || attempts >= config.maxAttempts || wait > MAX_RETRY_AFTER_MS || now() + wait >= deadline) {
          return fail(result.error.category, { model, attempts, queue_wait_ms: queueWait, status });
        }
        // The slot is held while backing off, so retries never add parallel pressure.
        await sleep(wait, signal);
      }
    } catch (error) {
      if (caller.aborted) { log({ ...meta, outcome: 'aborted', attempts, latency_ms: now() - started }); throw caller.reason; }
      if (error instanceof FeatherlessError) return fail(error.category, { model, attempts, queue_wait_ms: queueWait });
      // Anything unexpected is a controlled failure, never an escaped exception or a fake reply.
      return fail('provider_error', { model, attempts, queue_wait_ms: queueWait, unexpected: true });
    } finally {
      clearTimeout(timer);
      release?.();
    }
  }

  return { chat, limiter, config };
}

let shared: ReturnType<typeof createFeatherlessClient> | null = null;
/** Process-wide client (one queue). Reads env on first call, so a missing key never blocks startup. */
export function sharedFeatherlessClient() { return (shared ??= createFeatherlessClient(readFeatherlessConfig())); }

/** Ports['chat'] implementation for wiring. */
export const chat = (input: ChatRequest, context: Context): Promise<SeamResult<ChatValue>> => sharedFeatherlessClient().chat(input, context);
