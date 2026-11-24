import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import type { Database } from './db/client.js';
import { registerControlPlaneRoutes } from './routes.js';

export type AppOptions = { db?: Database; authSecret?: string };

export function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: false });

  app.register(jwt, { secret: options.authSecret ?? 'test-secret-that-is-long-enough' });

  app.get('/health', async () => ({ status: 'ok' as const, service: 'control-api' }));
  app.get('/ready', async () => ({ status: 'ok' as const, service: 'control-api' }));

  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      return reply.code(409).send({
        error: {
          code: 'CONFLICT',
          message: 'A resource with these values already exists',
          details: [],
        },
      });
    }

    app.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: [] },
    });
  });

  if (options.db) app.register(registerControlPlaneRoutes, { db: options.db });

  return app;
}
