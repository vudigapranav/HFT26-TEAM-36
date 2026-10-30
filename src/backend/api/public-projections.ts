import type { RunResult, Task } from '@torquecode/contracts';
import type { InternalRunResult, PrivateTask } from '../contracts/internal.js';

export function publicTask(task: PrivateTask): Task {
  return {
    task_id: task.task_id, tier: task.tier, domain: task.domain, language: task.language,
    task_type: task.task_type, title: task.title, statement_md: task.statement_md,
    dsa_topics: [...task.dsa_topics],
    files: task.files.map(file => ({ path: file.path, content: file.content, editable: file.editable })),
    visible_tests: task.visible_tests.map(test => ({ id: test.id, path: test.path, content: test.content })),
    source: task.source,
  };
}

export function publicRun(result: InternalRunResult): RunResult {
  if (result.mode === 'run' && result.tests.some(test => test.visibility === 'hidden')) {
    throw new Error('Run mode must not contain hidden test results');
  }
  const visible = result.tests.filter(test => test.visibility === 'visible').map(test => ({
    id: test.id, status: test.status, duration_ms: test.duration_ms,
  }));
  const hidden = result.tests.filter(test => test.visibility === 'hidden');
  return {
    run_id: result.run_id, task_id: result.task_id, mode: result.mode, visible,
    hidden: result.mode === 'submit' ? { passed: hidden.filter(test => test.status === 'pass').length, total: hidden.length } : null,
    passed: result.passed, total: result.total,
    // Submit output can embed hidden inputs/expected answers even in assertion messages.
    stdout: result.mode === 'run' ? result.stdout : '', stderr: result.mode === 'run' ? result.stderr : '',
    timed_out: result.timed_out,
  };
}
