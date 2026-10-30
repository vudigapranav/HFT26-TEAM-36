// Manual live check (spends real Featherless credit; never run by `pnpm test`):
//   pnpm gen:smoke    one real generateAssessment for tests/fixtures/portfolios/normal-web.json
// Real model (shared R4 client), real R3 runner, real K5 validator. Capped by LLM_EVAL_CAP_USD
// (default 0.20). Prints metadata and gate outcomes only, never the reference or hidden tests.
import { readFileSync } from 'node:fs';
import type { CandidateProfile, ChatRequest, Context, ValidationReceipt } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { loadSeedBank } from '../api/seed-bank.js';
import { parsePortfolio } from '../intake/portfolio.js';
import { createFeatherlessClient, readFeatherlessConfig, type LogEvent } from '../llm/featherless.js';
import { createDockerRunner } from '../runner/dockerRunner.js';
import { createGenerator, type GenerationLog } from './generate.js';
import { createValidationEngine } from './validate.js';

// Verified pricing for the generation model (R0/R4 metadata): USD per 1M tokens.
const PRICE = { input: 0.125, output: 0.45 };
const CAP_USD = Number(process.env.LLM_EVAL_CAP_USD ?? '0.20');

async function main() {
  const parsed = parsePortfolio(JSON.parse(readFileSync('tests/fixtures/portfolios/normal-web.json', 'utf8')));
  if (parsed.kind !== 'ok' || 'errors' in parsed.value) throw new Error('fixture portfolio did not parse');
  const profile = parsed.value as CandidateProfile;
  const calls: LogEvent[] = [];
  const client = createFeatherlessClient(readFeatherlessConfig(), { log: e => { if (e.event === 'featherless_chat') calls.push(e); } });
  const spent = () => calls.reduce((sum, c) => sum + ((Number(c.prompt_tokens) || 0) * PRICE.input + (Number(c.completion_tokens) || 0) * PRICE.output) / 1e6, 0);
  // Budget guard: refuse further calls once the cap is reached.
  const chat: Ports['chat'] = (input: ChatRequest, context: Context) => spent() >= CAP_USD
    ? Promise.resolve({ kind: 'unavailable', code: 'SANDBOX_UNAVAILABLE', message: 'LLM unavailable: budget cap reached' })
    : client.chat(input, context);
  const runTests = createDockerRunner();
  const k5 = createValidationEngine(runTests);
  const receipts: ValidationReceipt[] = [];
  const validateTask: Ports['validateTask'] = async (input, context) => {
    const result = await k5(input, context);
    if (result.kind === 'ok') receipts.push(result.value);
    return result;
  };
  const events: GenerationLog[] = [];
  const generate = createGenerator({ chat, runTests, validateTask, seedBank: () => loadSeedBank(), log: e => { events.push(e); console.log(JSON.stringify(e)); } });
  const started = performance.now();
  const result = await generate({ profile, focus_lane: { domain: profile.domain, skills: profile.skills, topics: profile.claimed_topics }, progress: () => {} },
    { signal: AbortSignal.timeout(15 * 60_000) });
  const summary = {
    ok: result.kind === 'ok',
    tiers: result.kind === 'ok' ? Object.fromEntries(Object.entries(result.value).map(([tier, task]) => [tier, { source: task.source, task_id: task.task_id, title: task.title }])) : null,
    receipts: receipts.map(r => ({ task_id: r.task_id, valid: r.valid, gates: r.gates.map(g => `${g.gate}:${g.status}`).join(' ') })),
    model_calls: calls.length, model: [...new Set(calls.map(c => String(c.model)))],
    model_latency_ms: calls.map(c => c.latency_ms), prompt_tokens: calls.reduce((s, c) => s + (Number(c.prompt_tokens) || 0), 0),
    completion_tokens: calls.reduce((s, c) => s + (Number(c.completion_tokens) || 0), 0), cost_usd: Number(spent().toFixed(6)), cap_usd: CAP_USD,
    total_ms: Math.round(performance.now() - started),
  };
  console.log(JSON.stringify({ summary }, null, 2));
}

if (process.argv[1]?.endsWith('smoke.ts')) await main();
