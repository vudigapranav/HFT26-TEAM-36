import type { FastifyError, FastifyInstance } from 'fastify';

export function registerErrors(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const failure = error as Partial<FastifyError>;
    const status = failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500 ? failure.statusCode : 500;
    // Never echo the request body, exception message, stack, or schema internals.
    reply.code(status).send({ error: {
      code: status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'INVALID_REQUEST' : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED',
      message: status === 500 ? 'Request failed' : 'Request rejected', request_id: request.id,
      ...(failure.validation ? { fields: failure.validation.slice(0, 50).map(issue => ({
        path: (issue.keyword === 'required' && typeof issue.params.missingProperty === 'string'
          ? `${issue.instancePath}/${issue.params.missingProperty.replace(/~/g, '~0').replace(/\//g, '~1')}`
          : issue.instancePath || '/').slice(0, 200), message: 'Invalid field',
      })) } : {}),
    } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: {
    code: 'NOT_FOUND', message: 'Route not found', request_id: request.id,
  } }));
}
