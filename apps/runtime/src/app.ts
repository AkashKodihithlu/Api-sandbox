import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' as const, service: 'mock-runtime' }));
  app.get('/ready', async () => ({ status: 'ok' as const, service: 'mock-runtime' }));

  return app;
}
