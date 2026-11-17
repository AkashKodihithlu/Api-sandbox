import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ status: 'ok' as const, service: 'control-api' }));
  app.get('/ready', async () => ({ status: 'ok' as const, service: 'control-api' }));

  return app;
}
