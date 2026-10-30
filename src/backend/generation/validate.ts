import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Value from 'typebox/value';
import { Task } from '@torquecode/contracts';
import type { File, Gate, PrivateTask, Topic, ValidationReceipt, InternalRunResult } from '../contracts/internal.js';
import type { Ports } from '../contracts/seams.js';
import { publicTask } from '../api/public-projections.js';
import { validateRequest } from '../runner/dockerRunner.js';
import { checkOutput, solutionFingerprint, STANDARD_POLICY } from '../llm/guards.js';

type Scan = { errors: string[]; unclaimed?: string[]; format_errors?: string[] };

function scanner(name: string, files: File[], topics: Topic[], signal: AbortSignal): Promise<Scan> {
  return new Promise((resolve, reject) => {
    const file = fileURLToPath(new URL(`../tools/${name}`, import.meta.url));
    const child = spawn(process.env.TORQUECODE_PYTHON || 'python3', [file], {
      stdio: ['pipe', 'pipe', 'pipe'],
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      env: { PATH: process.env.PATH || '/usr/bin:/bin', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let output = '';
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('Static analysis unavailable'));
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (part: string) => {
      output += part;
      if (output.length > 131072) fail();
    });
    child.stderr.resume();
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) return fail();
      try {
        const value: unknown = JSON.parse(output);
        if (!value || typeof value !== 'object' || !('errors' in value) ||
            !Array.isArray(value.errors)) return fail();
        settled = true;
        resolve(value as Scan);
      } catch { fail(); }
    });
    child.stdin.end(JSON.stringify({ files, claimed_topics: topics }));
  });
}

function validStructure(task: PrivateTask): boolean {
  try {
    if (!Value.Check(Task, publicTask(task)) || task.language !== 'python') return false;
    if (task.hint_ladder.length !== 3 || task.hint_ladder.some(h => !h.trim())) return false;
    if (!task.reference_files.length || task.reference_files.length !== task.files.length) return false;
    if (!task.tests.length || !task.f2p_ids.length) return false;

    const allIds = task.tests.flatMap(t => t.ids);
    const classified = [...task.f2p_ids, ...task.p2p_ids];
    if (!allIds.length || new Set(allIds).size !== allIds.length ||
        classified.length !== allIds.length ||
        new Set(classified).size !== classified.length ||
        classified.some(id => !allIds.includes(id))) return false;

    for (const file of task.files) {
      const reference = task.reference_files.find(f => f.path === file.path);
      if (!reference || reference.editable !== file.editable) return false;
      if (!file.editable && reference.content !== file.content) return false;
    }
    if (!task.files.some(f => f.editable)) return false;

    const visible = task.tests.filter(t => t.visibility === 'visible');
    const ids = visible.flatMap(t => t.ids);
    if (!ids.length || ids.length !== task.visible_tests.length) return false;
    if (task.visible_tests.some(t => !visible.some(v =>
      v.path === t.path && v.content === t.content && v.ids.includes(t.id)))) return false;

    const request = (files: File[]) => ({
      task_id: task.task_id, files, tests: task.tests,
      limits: task.limits, mode: 'submit' as const,
    });
    return validateRequest(request(task.files)) === null &&
      validateRequest(request(task.reference_files)) === null;
  } catch { return false; }
}

function leakFree(task: PrivateTask): boolean {
  const normalize = (code: string) =>
    code.split('\n').map(line => line.replace(/#.*$/, '').replace(/\s+/g, ''))
      .join('');

  const starter = task.files.filter(f => f.editable).map(f => normalize(f.content)).join('|');
  const reference = task.reference_files.filter(f => f.editable)
    .map(f => normalize(f.content)).join('|');

  if (starter === reference) return false;

  const fingerprint = solutionFingerprint(task.reference_files, task.files);
  return task.hint_ladder.every(h => checkOutput(h, {
    files: task.files, fingerprint, policy: STANDARD_POLICY,
  }).ok);
}

function complete(result: InternalRunResult, task: PrivateTask): boolean {
  const expected = task.tests.flatMap(t => t.ids);
  const actual = result.tests.map(t => t.id);
  return result.mode === 'submit' && result.task_id === task.task_id &&
    !result.timed_out && result.total === expected.length &&
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every(id => actual.includes(id)) &&
    result.passed === result.tests.filter(t => t.status === 'pass').length;
}

export function createValidationEngine(runTests: Ports['runTests']): Ports['validateTask'] {
  return async ({ task, claimed_topics }, context) => {
    context.signal.throwIfAborted();
    const gates: Gate[] = [];
    const add = (gate: Gate['gate'], status: Gate['status'], reason: string) =>
      gates.push({ gate, status, reason });
    const done = () => ({
      kind: 'ok' as const,
      value: {
        task_id: task.task_id,
        valid: gates.length > 0 && gates.every(g => g.status === 'pass'),
        gates,
      } satisfies ValidationReceipt,
    });
    const skip = (reason: string, names: Gate['gate'][]) => {
      for (const name of names) add(name, 'skipped', reason);
    };

    if (!validStructure(task)) {
      add('schema', 'fail', 'Invalid task structure or trusted test manifest');
      skip('Schema validation failed', [
        'topics', 'imports', 'format', 'examples', 'leakage',
        'reference', 'starter', 'differential', 'performance',
      ]);
      return done();
    }
    add('schema', 'pass', 'Complete task and test manifest');

    let topics: Scan;
    let imports: Scan;
    try {
      [topics, imports] = await Promise.all([
        scanner('topic_scan.py', task.reference_files, claimed_topics, context.signal),
        scanner('import_check.py', [
          ...task.files, ...task.reference_files,
          ...task.tests.map(t => ({ path: t.path, content: t.content, editable: false })),
        ], claimed_topics, context.signal),
      ]);
    } catch {
      add('topics', 'fail', 'Static scanner unavailable');
      add('imports', 'fail', 'Static scanner unavailable');
      skip('Static analysis incomplete', ['format', 'examples', 'leakage', 'reference', 'starter', 'differential', 'performance']);
      return done();
    }

    const topicOK = task.dsa_topics.every(t => claimed_topics.includes(t)) &&
      topics.errors.length === 0 && !topics.unclaimed?.length;
    add('topics', topicOK ? 'pass' : 'fail',
      topicOK ? 'Topics are supported by candidate claims' : 'Unclaimed topic or invalid source');

    add('imports', imports.errors.length ? 'fail' : 'pass',
      imports.errors.length ? 'Disallowed imports or code execution' : 'Imports allowed');

    add('format', imports.format_errors?.length ? 'fail' : 'pass',
      imports.format_errors?.length ? 'Unsupported test structure' : 'Static runner format checks passed');

    add('examples', 'pass', 'Visible tests match the manifest');
    add('leakage', leakFree(task) ? 'pass' : 'fail',
      leakFree(task) ? 'No detected solution leakage' : 'Starter or hints expose reference logic');

    if (gates.some(g => g.status === 'fail')) {
      skip('Static validation failed', ['reference', 'starter', 'differential', 'performance']);
      return done();
    }

    const execute = async (files: File[]) => {
      try {
        return await runTests({
          task_id: task.task_id, files, tests: task.tests,
          mode: 'submit', limits: task.limits,
        }, context);
      } catch {
        return { kind: 'unavailable' as const, code: 'SANDBOX_UNAVAILABLE' as const,
          message: 'Trusted runner unavailable' };
      }
    };

    const referenceRuns: InternalRunResult[] = [];
    for (let i = 0; i < 3; i++) {
      const run = await execute(task.reference_files);
      if (run.kind !== 'ok') {
        if (run.kind === 'unavailable' && /not supported/i.test(run.message)) {
          const format = gates.find(g => g.gate === 'format')!;
          format.status = 'fail';
          format.reason = 'Unsupported isolated-runner task format';
        }
        add('reference', run.kind === 'unavailable' ? 'skipped' : 'fail',
          'Reference execution not verified');
        skip('Reference not verified', ['starter', 'differential', 'performance']);
        return done();
      }
      if (!complete(run.value, task) || run.value.passed !== run.value.total) {
        add('reference', 'fail', 'Reference failed a trusted test');
        skip('Reference failed', ['starter', 'differential', 'performance']);
        return done();
      }
      referenceRuns.push(run.value);
    }
    add('reference', 'pass', 'Reference passed all tests three times');

    const starter = await execute(task.files);
    if (starter.kind !== 'ok' || !complete(starter.value, task)) {
      add('starter', starter.kind === 'unavailable' ? 'skipped' : 'fail',
        'Starter execution not verified');
      skip('Starter not verified', ['differential', 'performance']);
      return done();
    }

    const statuses = new Map(starter.value.tests.map(t => [t.id, t.status]));
    const f2p = task.f2p_ids.every(id => statuses.get(id) === 'fail');
    const p2p = task.p2p_ids.every(id => statuses.get(id) === 'pass');
    add('starter', f2p && p2p ? 'pass' : 'fail',
      f2p && p2p ? 'Starter F2P/P2P verified' : 'Starter outcomes contradict manifest');

    const signature = (r: InternalRunResult) =>
      r.tests.map(t => `${t.id}:${t.status}`).sort().join('|');
    const stable = referenceRuns.every(r => signature(r) === signature(referenceRuns[0]!));
    add('differential', stable ? 'pass' : 'fail',
      stable ? 'Reference results deterministic' : 'Reference results inconsistent');

    const perfIds = task.tests.flatMap(t => t.ids)
      .filter(id => /performance|perf|large_window/i.test(id));
    const perfOK = task.tier !== 'master' || (
      perfIds.length > 0 &&
      perfIds.every(id =>
        referenceRuns.every(r => r.tests.find(t => t.id === id)?.status === 'pass') &&
        statuses.get(id) === 'fail')
    );
    add('performance', perfOK ? 'pass' : 'fail',
      perfOK ? 'Performance verified or not applicable' : 'Master performance gate failed');

    return done();
  };
}
