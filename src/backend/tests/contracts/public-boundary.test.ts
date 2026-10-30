import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import * as publicExports from '@torquecode/contracts';
import { buildApp } from '../../api/app.js';
import { createDevPorts } from '../../api/dev-stubs.js';
import { publicRun, publicTask } from '../../api/public-projections.js';
import { loadSeed } from '../../runner/local/seed-runner.js';

describe('public/private contracts', () => {
  it('does not export server types or accept frontend-forged scoring events', async () => {
    expect(Object.keys(publicExports).some(key => /private|reference|hint_ladder|InternalRun|Ports/.test(key))).toBe(false);
    expect(() => createRequire(import.meta.url).resolve('@torquecode/contracts/internal')).toThrow();
    const app = await buildApp({ ports: createDevPorts() });
    try {
      app.post('/test-events', { schema: { body: publicExports.EventsRequest } }, async () => ({ accepted: true }));
      for (const type of ['submit', 'tier_unlocked', 'hint_served', 'session_end']) {
        const response = await app.inject({ method: 'POST', url: '/test-events', payload: { events: [{ task_id: 'task', client_ts: '2026-10-30T00:00:00Z', type, payload: {} }] } });
        expect(response.statusCode).toBe(400);
      }
    } finally { await app.close(); }
  });

  it('uses explicit nested allow-lists for task responses and serialization', async () => {
    const task = await loadSeed();
    Object.assign(task, { reference_files: [{ path: 'secret.py', content: 'REFERENCE_SECRET_SENTINEL', editable: false }], hint_ladder: ['HINT_SECRET_SENTINEL'] });
    Object.assign(task.files[0]!, { privateProbe: 'NESTED_LEAK_CANARY' });
    const projected = publicTask(task);
    expect(JSON.stringify(projected)).not.toContain('SECRET_SENTINEL');
    expect(projected.files[0]).not.toHaveProperty('privateProbe');
    expect(JSON.stringify(projected)).not.toContain('NESTED_LEAK_CANARY');
    const app = await buildApp({ ports: createDevPorts() });
    try {
      app.get('/test-task', { schema: { response: { 200: publicExports.Task } } }, async () => task);
      const response = await app.inject('/test-task');
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('SECRET_SENTINEL');
      expect(response.json().files[0]).not.toHaveProperty('privateProbe');
      expect(response.body).not.toContain('NESTED_LEAK_CANARY');
      expect(response.body).not.toContain('test_hidden.py');
    } finally { await app.close(); }
  });

  it('returns hidden aggregates and strips all submit logs and hidden test identifiers', () => {
    const input = {
      run_id: 'run', task_id: 'task', mode: 'submit' as const,
      tests: [{ id: 'visible-test', visibility: 'visible' as const, status: 'pass' as const, duration_ms: 1 },
        { id: 'HIDDEN_SECRET_SENTINEL', visibility: 'hidden' as const, status: 'fail' as const, duration_ms: 2 }],
      passed: 1, total: 2, stdout: 'SECRET_SENTINEL expected value', stderr: 'SECRET_SENTINEL traceback', timed_out: false,
    };
    const result = publicRun(input);
    expect(result.hidden).toEqual({ passed: 0, total: 1 });
    expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    expect(result.visible).toHaveLength(1);
    expect(() => publicRun({ ...input, mode: 'run' })).toThrow('Run mode must not contain hidden');
    const run = publicRun({ ...input, mode: 'run', tests: [input.tests[0]!], passed: 1, total: 1, stdout: 'visible log', stderr: '' });
    expect(run.hidden).toBeNull();
    expect(run.stdout).toBe('visible log');
  });
});
