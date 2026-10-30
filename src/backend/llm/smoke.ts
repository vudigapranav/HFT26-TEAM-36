// Manual smoke test: ONE real Featherless chat call. Never run by `pnpm test`.
//   pnpm llm:smoke            (assistant model)
//   pnpm llm:smoke generation
// Reads FEATHERLESS_* from the environment (the script loads the repo-root .env if present).
import { createFeatherlessClient, readFeatherlessConfig, type FeatherlessDeps, type Purpose } from './featherless.js';

export async function runSmoke(purpose: Purpose, env: NodeJS.ProcessEnv = process.env, deps: FeatherlessDeps = {}) {
  const client = createFeatherlessClient(readFeatherlessConfig(env), deps);
  const started = performance.now();
  const result = await client.chat({
    purpose, model: 'default', max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with exactly one word: ready' }],
  }, { signal: AbortSignal.timeout(90_000) });
  const latency_ms = Math.round(performance.now() - started);
  if (result.kind !== 'ok') return { ok: false as const, purpose, latency_ms, error: result.kind === 'unavailable' ? result.message : result.kind };
  return { ok: true as const, purpose, model: result.value.model, latency_ms, reply_chars: result.value.content.length, reply_preview: result.value.content.slice(0, 40) };
}

if (process.argv[1]?.endsWith('smoke.ts')) {
  const purpose = process.argv[2] === 'generation' ? 'generation' : 'assistant';
  const outcome = await runSmoke(purpose);
  console.log(JSON.stringify(outcome));
  if (!outcome.ok) process.exitCode = 1;
}
