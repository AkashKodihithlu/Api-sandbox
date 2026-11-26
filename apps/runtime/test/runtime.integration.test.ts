import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '@mockflow/db';
import {
  apiDefinitions,
  environmentScenarios,
  environments,
  projects,
  requestLogs,
  responseScenarios,
  users,
} from '@mockflow/db';
import type { MockEngineRoute } from '@mockflow/mock-engine';
import { buildApp } from '../src/app.js';
import type {
  ActiveProject,
  RequestLogEntry,
  ResolvedEnvironment,
  RuntimeStore,
} from '../src/store.js';

function createE2EMemoryStore() {
  const loggedRequests: RequestLogEntry[] = [];
  const activeProject: ActiveProject = { id: 'proj-e2e', slug: 'shop', name: 'Shop API' };

  const routes: MockEngineRoute[] = [
    {
      id: 'api-item',
      projectId: 'proj-e2e',
      name: 'Get Item',
      method: 'GET',
      path: '/items/:itemId',
      defaultScenarioId: 'scen-item-ok',
      isPublished: true,
      scenarios: [
        {
          id: 'scen-item-ok',
          apiDefinitionId: 'api-item',
          projectId: 'proj-e2e',
          name: 'Success',
          type: 'SUCCESS',
          statusCode: 200,
          headers: { 'x-item-source': 'mockflow' },
          body: { item: 'widget', available: true },
          delayMs: 15,
          isDefault: true,
        },
        {
          id: 'scen-item-not-found',
          apiDefinitionId: 'api-item',
          projectId: 'proj-e2e',
          name: 'NotFound',
          type: 'NOT_FOUND',
          statusCode: 404,
          headers: {},
          body: { message: 'Item not found' },
          delayMs: 0,
          isDefault: false,
        },
      ],
    },
    {
      id: 'api-checkout',
      projectId: 'proj-e2e',
      name: 'Checkout',
      method: 'POST',
      path: '/checkout',
      requestSchema: {
        type: 'object',
        required: ['cartId'],
        additionalProperties: false,
        properties: {
          cartId: { type: 'string', minLength: 1 },
        },
      },
      defaultScenarioId: 'scen-checkout-ok',
      isPublished: true,
      scenarios: [
        {
          id: 'scen-checkout-ok',
          apiDefinitionId: 'api-checkout',
          projectId: 'proj-e2e',
          name: 'Success',
          type: 'SUCCESS',
          statusCode: 201,
          headers: { 'x-checkout': 'ok' },
          body: { status: 'confirmed' },
          delayMs: 0,
          isDefault: true,
        },
        {
          id: 'scen-checkout-val',
          apiDefinitionId: 'api-checkout',
          projectId: 'proj-e2e',
          name: 'ValidationFailed',
          type: 'VALIDATION_ERROR',
          statusCode: 422,
          headers: {},
          body: { error: 'invalid_cart' },
          delayMs: 0,
          isDefault: false,
        },
      ],
    },
  ];

  const envMap: Record<string, ResolvedEnvironment> = {
    qa: {
      id: 'env-qa',
      name: 'qa',
      scenarios: { 'api-item': 'scen-item-not-found' },
    },
  };

  let failDb = false;

  const store: RuntimeStore = {
    findActiveProjectBySlug: vi.fn(async (slug: string) => {
      if (failDb) throw new Error('DB connection lost');
      if (slug === 'archived') return null;
      return slug === 'shop' ? activeProject : null;
    }),
    loadPublishedRoutesForProject: vi.fn(async () => routes),
    resolveEnvironment: vi.fn(async (_projectId, key) => envMap[key] ?? null),
    recordRequestLog: vi.fn(async (entry) => {
      loggedRequests.push(entry);
    }),
  };

  return {
    store,
    loggedRequests,
    setFailDb(next: boolean) {
      failDb = next;
    },
  };
}

describe('runtime end-to-end integration (in-memory store + Fastify lifecycle)', () => {
  it('executes full HTTP request lifecycle, safeguards, and logging', async () => {
    const { store, loggedRequests, setFailDb } = createE2EMemoryStore();
    const onClose = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ store, onClose, maxRequestBodyBytes: 256, maxDelayMs: 200 });

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    try {
      // 1. Valid GET with path params + query + sensitive header redaction
      const getRes = await app.inject({
        method: 'GET',
        url: '/p/shop/items/42?expand=details',
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'sid=xyz',
          'x-client': 'web',
        },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.headers['x-item-source']).toBe('mockflow');
      expect(getRes.headers['x-content-type-options']).toBe('nosniff');
      expect(getRes.json()).toEqual({ item: 'widget', available: true });

      // 2. Environment-specific override
      const qaRes = await app.inject({
        method: 'GET',
        url: '/p/shop/items/42',
        headers: { 'x-mockflow-environment': 'qa' },
      });
      expect(qaRes.statusCode).toBe(404);
      expect(qaRes.json()).toEqual({ message: 'Item not found' });

      // 3. Explicit scenario override beats environment
      const explicitRes = await app.inject({
        method: 'GET',
        url: '/p/shop/items/42',
        headers: {
          'x-mockflow-environment': 'qa',
          'x-mockflow-scenario-name': 'Success',
        },
      });
      expect(explicitRes.statusCode).toBe(200);

      // 4. POST validation success and validation failure
      const validPost = await app.inject({
        method: 'POST',
        url: '/p/shop/checkout',
        headers: { 'content-type': 'application/json' },
        payload: { cartId: 'c-1' },
      });
      expect(validPost.statusCode).toBe(201);
      expect(validPost.json()).toEqual({ status: 'confirmed' });

      const invalidPost = await app.inject({
        method: 'POST',
        url: '/p/shop/checkout',
        headers: { 'content-type': 'application/json' },
        payload: { unexpected: true },
      });
      expect(invalidPost.statusCode).toBe(422);
      expect(invalidPost.json()).toEqual({ error: 'invalid_cart' });

      // 5. Wrong method, unmatched route, unknown/archived project
      expect((await app.inject({ method: 'DELETE', url: '/p/shop/checkout' })).statusCode).toBe(
        404,
      );
      expect((await app.inject({ method: 'GET', url: '/p/shop/missing' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/p/unknown/items/1' })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/p/archived/items/1' })).statusCode).toBe(
        404,
      );

      // 6. Malformed JSON & oversized payload
      const malformed = await app.inject({
        method: 'POST',
        url: '/p/shop/checkout',
        headers: { 'content-type': 'application/json' },
        payload: '{invalid',
      });
      expect(malformed.statusCode).toBe(400);

      const oversized = await app.inject({
        method: 'POST',
        url: '/p/shop/checkout',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ cartId: 'x'.repeat(500) }),
      });
      expect(oversized.statusCode).toBe(413);

      // 7. DB failure returns safe 500 without leaking error text
      setFailDb(true);
      const dbErr = await app.inject({ method: 'GET', url: '/p/shop/items/42' });
      expect(dbErr.statusCode).toBe(500);
      expect(dbErr.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
      setFailDb(false);

      // 8. Verify request logs captured and sensitive headers redacted
      expect(loggedRequests.length).toBeGreaterThanOrEqual(5);
      expect(loggedRequests[0]).toMatchObject({
        projectId: 'proj-e2e',
        apiDefinitionId: 'api-item',
        scenarioId: 'scen-item-ok',
        method: 'GET',
        path: '/items/42',
        statusCode: 200,
      });
      expect(loggedRequests[0].redactedHeaders).toMatchObject({
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        'x-client': 'web',
      });
    } finally {
      await app.close();
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('runtime PostgreSQL end-to-end integration', () => {
  const connection = createDatabase(databaseUrl!);
  const app = buildApp({ db: connection.db });

  beforeAll(async () => {
    await connection.client.unsafe(
      'TRUNCATE request_logs, environment_scenarios, environments, response_scenarios, api_definitions, project_members, projects, users CASCADE',
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await connection.client.end();
  });

  it('resolves published endpoints from PostgreSQL, skips drafts, and persists redacted request_logs', async () => {
    const [user] = await connection.db
      .insert(users)
      .values({ email: 'runtime-e2e@example.test', passwordHash: 'hash' })
      .returning();
    const [project] = await connection.db
      .insert(projects)
      .values({ ownerId: user.id, name: 'E2E', slug: 'e2e-proj', status: 'ACTIVE' })
      .returning();
    const [publishedApi] = await connection.db
      .insert(apiDefinitions)
      .values({
        projectId: project.id,
        name: 'Published',
        method: 'GET',
        path: '/orders/:orderId',
        isPublished: true,
      })
      .returning();
    await connection.db.insert(apiDefinitions).values({
      projectId: project.id,
      name: 'Draft',
      method: 'GET',
      path: '/draft',
      isPublished: false,
    });
    const [scenario] = await connection.db
      .insert(responseScenarios)
      .values({
        apiDefinitionId: publishedApi.id,
        name: 'DefaultOk',
        type: 'SUCCESS',
        statusCode: 200,
        headers: { 'x-e2e': 'true' },
        body: { ok: true },
        delayMs: 0,
        isDefault: true,
      })
      .returning();
    const [env] = await connection.db
      .insert(environments)
      .values({ projectId: project.id, name: 'prod' })
      .returning();
    await connection.db.insert(environmentScenarios).values({
      environmentId: env.id,
      apiDefinitionId: publishedApi.id,
      scenarioId: scenario.id,
    });

    const okRes = await app.inject({
      method: 'GET',
      url: '/p/e2e-proj/orders/99',
      headers: { authorization: 'Bearer db-secret', 'x-mockflow-environment': 'prod' },
    });
    expect(okRes.statusCode).toBe(200);
    expect(okRes.json()).toEqual({ ok: true });

    const draftRes = await app.inject({ method: 'GET', url: '/p/e2e-proj/draft' });
    expect(draftRes.statusCode).toBe(404);

    const logs = await connection.db.select().from(requestLogs);
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs[0].redactedHeaders).toMatchObject({ authorization: '[REDACTED]' });
  });
});
