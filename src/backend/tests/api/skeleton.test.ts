import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Portfolio } from '@torquecode/contracts';
import { buildApp } from '../../api/app.js';
import { createDevPorts } from '../../api/dev-stubs.js';
import { readConfig } from '../../api/config.js';

const apps: FastifyInstance[] = [];
async function setup() { const app = await buildApp({ ports: createDevPorts() }); apps.push(app); return app; }
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('K1 HTTP boundary', () => {
  it('starts without database/LLM credentials and reports disabled candidate execution', async () => {
    const app = await setup();
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', mode: 'skeleton', candidate_execution: false });
    expect(Object.keys(app.swagger().paths ?? {})).toEqual(['/health']);
  });

  it('does not expose developer seams or echo injected paths into errors', async () => {
    const app = await setup();
    for (const url of ['/assistant', '/portfolio', '/reference/SECRET_SENTINEL']) {
      const response = await app.inject({ method: 'POST', url, payload: { secret: 'SECRET_SENTINEL' } });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('SECRET_SENTINEL');
    }
  });

  it('rejects oversized and malformed bodies, unknown fields and wrong types', async () => {
    const app = await setup();
    app.post('/test-contract', { schema: { body: Portfolio } }, async () => ({ accepted: true }));
    const valid = { candidate: { name: 'Candidate', email: 'candidate@example.org' }, projects: [], tech_stack: ['python'], skills: ['rest-apis'], dsa_topics_solved: ['arrays'] };
    expect((await app.inject({ method: 'POST', url: '/test-contract', payload: valid })).statusCode).toBe(200);
    for (const payload of [{ ...valid, server_only: 'SECRET_SENTINEL' }, { ...valid, skills: 'python' }]) {
      const response = await app.inject({ method: 'POST', url: '/test-contract', payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.fields.length).toBeGreaterThan(0);
      expect(response.body).not.toContain('SECRET_SENTINEL');
    }
    const huge = await app.inject({ method: 'POST', url: '/test-contract', payload: { ...valid, padding: 'x'.repeat(270_000) } });
    expect(huge.statusCode).toBe(413);
    const malformed = await app.inject({ method: 'POST', url: '/test-contract', headers: { 'content-type': 'application/json' }, payload: '{' });
    expect(malformed.statusCode).toBe(400);
  });

  it('hides internal exception details', async () => {
    const app = await setup();
    app.get('/test-failure', async () => { throw new Error('REFERENCE_SECRET_SENTINEL'); });
    const response = await app.inject('/test-failure');
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('REFERENCE_SECRET_SENTINEL');
    expect(response.json().error.code).toBe('INTERNAL_ERROR');
  });

  it('identifies the missing nested field in schema validation errors', async () => {
    const app = await setup();
    app.post('/test-required-field', { schema: { body: Portfolio } }, async () => ({ accepted: true }));
    const response = await app.inject({ method: 'POST', url: '/test-required-field', payload: {
      candidate: { email: 'candidate@example.org' }, projects: [], tech_stack: ['python'],
      skills: ['rest-apis'], dsa_topics_solved: ['arrays'],
    } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields).toContainEqual({ path: '/candidate/name', message: 'Invalid field' });
  });

  it('rejects invalid ports, remote binding and unsupported modes', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3001, mode: 'skeleton' });
    for (const env of [{ PORT: '' }, { PORT: '0' }, { PORT: '3001.1' }, { PORT: '65536' }, { APP_MODE: 'production' }, { HOST: '0.0.0.0' }]) expect(() => readConfig(env)).toThrow();
  });
});
