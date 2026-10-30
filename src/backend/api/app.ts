import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError, Health } from '@torquecode/contracts';
import type { Ports } from '../contracts/seams.js';
import { registerAssessments, type AssessmentOptions } from './assessments.js';
import { registerAuth, type AuthOptions } from './auth.js';
import type { RunnerStatus } from './runner-status.js';
import { registerErrors } from './errors.js';

export async function buildApp(dependencies: { ports: Ports; auth?: AuthOptions; assessment?: AssessmentOptions; runner?: RunnerStatus; trust_proxy?: boolean }) {
  const app = Fastify({
    trustProxy: dependencies.trust_proxy ?? false, logger: false, bodyLimit: 262_144, requestTimeout: 10_000,
    // No coercion or silent removal: reject unknown/mistyped input.
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();
  app.decorate('ports', dependencies.ports);
  registerErrors(app);
  await app.register(swagger, { openapi: {
    info: { title: 'TorqueCode backend', version: '0.1.0', description: 'Health, optional cookie authentication and seed checkpoint routes. Runner capability and availability are reported by health and assessment status.' },
  } });
  if (dependencies.auth) await registerAuth(app, dependencies.auth);
  if (dependencies.assessment) await app.register(async scoped => {
    await registerAssessments(scoped, dependencies.ports, dependencies.assessment!);
  });
  app.get('/health', { schema: { response: { 200: Health, 500: ApiError } } }, async () => ({
    status: dependencies.runner?.runner === 'isolated' && !dependencies.runner.available ? 'degraded' as const : 'ok' as const,
    mode: dependencies.auth ? 'auth' as const : 'skeleton' as const,
    candidate_execution: Boolean(dependencies.assessment && dependencies.runner?.runner === 'isolated' && dependencies.runner.available),
    ...(dependencies.runner ? { runner: dependencies.runner.runner, runner_available: dependencies.runner.available, ...(dependencies.runner.image ? { runner_image: dependencies.runner.image } : {}) } : {}),
  }));
  return app;
}
