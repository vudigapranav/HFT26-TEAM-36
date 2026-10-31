// Reuse of K5 validation receipts. A receipt is reused only when everything that could change its verdict is
// byte-identical: the task's executable/contract content, the claimed topics, the validation policy, the trusted
// family code (oracles, templates, validator), the runner harness and the runner environment (Docker image ID or
// E2B template). Only fully verified receipts are stored; failures and unverifiable identities are never cached, so a
// cache problem can only cost time, never certify a task. Process-local: a restart starts cold.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { PrivateTask, ValidationReceipt } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { VALIDATION_POLICY } from './families.js';
import { harnessDir } from '../runner/dockerRunner.js';
import { pathToFileURL } from 'node:url';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
// Canonical JSON: object keys sorted, so equal content always hashes equally.
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`
  : JSON.stringify(value);

/** Fields that never affect the verdict: identity and provenance labels. Everything else is part of the key. */
export function taskFingerprint(task: PrivateTask): string {
  const { task_id: _id, source: _source, selection: _selection, ...content } = task;
  return sha(canonical(content));
}

async function filesHash(dir: URL, names?: string[]): Promise<string | null> {
  try {
    const path = fileURLToPath(dir);
    const list = (names ?? (await readdir(path)).filter(n => /\.(ts|js|py)$/.test(n) && !n.endsWith('.d.ts'))).sort();
    const parts = await Promise.all(list.map(async n => `${n}:${sha(await readFile(fileURLToPath(new URL(n, dir)), 'utf8'))}`));
    return parts.length ? sha(parts.join('|')) : null;
  } catch { return null; }
}

function dockerImageId(image: string): Promise<string | null> {
  return new Promise(resolve => execFile('docker', ['image', 'inspect', '--format', '{{.Id}}', image], { timeout: 5000 },
    (error, stdout) => resolve(error ? null : stdout.trim() || null)));
}

/** Everything outside the task that can change a verdict. null = unknown -> caching disabled (fail closed). */
export async function verificationIdentity(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const generation = await filesHash(new URL('./', import.meta.url)); // validator, families/oracles, templates
  // The same harness directory the runner mounts (works from src and dist, honours RUNNER_HARNESS_DIR).
  const harness = await harnessDir().then(dir => filesHash(pathToFileURL(dir.endsWith('/') ? dir : `${dir}/`), ['grade.py', 'protocol.py', 'worker.py']), () => null);
  let runner: string | null;
  if (env.RUNNER === 'docker') runner = await dockerImageId(env.RUNNER_IMAGE || 'torquecode-runner-python:dev').then(id => id && `docker:${id}`);
  else if (env.RUNNER === 'e2b') runner = `e2b:${env.E2B_TEMPLATE || 'torquecode-runner-python'}`;
  else runner = 'immutable_seed_only';
  if (!generation || !harness || !runner) return null;
  return sha(canonical({ policy: VALIDATION_POLICY, generation, harness, runner }));
}

export type ReceiptCache = Ports['validateTask'] & { stats(): { hits: number; misses: number; stored: number; disabled: boolean } };

export function withReceiptCache(validate: Ports['validateTask'], identity: () => Promise<string | null> = verificationIdentity, max = 512): ReceiptCache {
  const receipts = new Map<string, ValidationReceipt>();
  const inflight = new Map<string, ReturnType<Ports['validateTask']>>();
  let identityPromise: Promise<string | null> | undefined;
  let hits = 0, misses = 0, disabled = false;
  const cached = (async (input, context) => {
    identityPromise ??= identity().catch(() => null);
    const id = await identityPromise;
    if (!id) { disabled = true; misses++; return validate(input, context); }
    const key = sha(canonical({ id, task: taskFingerprint(input.task), claimed: [...input.claimed_topics].sort() }));
    const hit = receipts.get(key);
    if (hit) { hits++; return { kind: 'ok', value: { ...structuredClone(hit), task_id: input.task.task_id } }; }
    misses++;
    let pending = inflight.get(key);
    if (!pending) {
      pending = validate(input, context);
      inflight.set(key, pending);
      void pending.finally(() => inflight.delete(key)).catch(() => {});
    }
    const result = await pending;
    if (result.kind === 'ok' && result.value.valid && result.value.semantic_verified === true && result.value.structural_valid === true) {
      if (receipts.size >= max) receipts.delete(receipts.keys().next().value!);
      receipts.set(key, structuredClone(result.value));
      return { kind: 'ok', value: { ...structuredClone(result.value), task_id: input.task.task_id } };
    }
    return result;
  }) as ReceiptCache;
  cached.stats = () => ({ hits, misses, stored: receipts.size, disabled });
  return cached;
}
