import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { ApiError, Health } from '@torquecode/contracts';
import type { Ports } from '../contracts/seams.js';
import { registerErrors } from './errors.js';

export async function buildApp(dependencies: { ports: Ports }) {
  const app = Fastify({
    logger: false, bodyLimit: 262_144, requestTimeout: 10_000,
    // No coercion or silent removal: reject unknown/mistyped input.
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();
  app.decorate('ports', dependencies.ports);
  registerErrors(app);
  await app.register(swagger, { openapi: {
    info: { title: 'TorqueCode K1 skeleton', version: '0.1.0', description: 'Only health is implemented. Development seams are not HTTP endpoints.' },
  } });
  app.get('/health', { schema: { response: { 200: Health, 500: ApiError } } }, async () => ({
    status: 'ok' as const, mode: 'skeleton' as const, candidate_execution: false as const,
  }));
  return app;
}
