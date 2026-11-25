import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase, type Database } from '../src/db/client.js';

function createMockDb(existingScenario: Record<string, unknown>): Database {
  const mockDb = {
    select: () => {
      // Alternate between scenario/api/membership lookups in PATCH /v1/scenarios/:scenarioId
      let callCount = 0;
      const results = [
        [existingScenario],
        [{ id: 'api-1', projectId: 'proj-1' }],
        [{ projectId: 'proj-1', userId: 'user-1', role: 'EDITOR' }],
      ];
      const next = () => results[Math.min(callCount++, results.length - 1)] ?? [];
      return {
        from: () => ({
          where: () => ({
            limit: async () => next(),
          }),
        }),
      };
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [existingScenario],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => [existingScenario],
      }),
    }),
    delete: () => ({
      where: async () => [],
    }),
  };

  return mockDb as unknown as Database;
}

describe('control-plane scenario & requestSchema validation', () => {
  it('rejects PATCH /v1/scenarios/:scenarioId when merged state has body with 204 statusCode', async () => {
    const existingScenario = {
      id: '11111111-1111-1111-1111-111111111111',
      apiDefinitionId: 'api-1',
      name: 'Success',
      type: 'SUCCESS',
      statusCode: 200,
      headers: {},
      body: { ok: true },
      delayMs: 0,
      isDefault: false,
    };

    // Each request triggers 3 select calls: scenario, api, membership
    let selectIndex = 0;
    const selectRows = [
      [existingScenario],
      [{ id: 'api-1', projectId: 'proj-1' }],
      [{ projectId: 'proj-1', userId: 'user-1', role: 'EDITOR' }],
    ];
    const db = {
      ...createMockDb(existingScenario),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => selectRows[selectIndex++] ?? [],
          }),
        }),
      }),
    } as unknown as Database;

    const app = buildApp({ db, authSecret: 'test-secret-that-is-long-enough' });
    await app.ready();
    const token = app.jwt.sign({ id: 'user-1', email: 'editor@example.test' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/scenarios/${existingScenario.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { statusCode: 204 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The supplied scenario configuration is invalid',
      },
    });
    await app.close();
  });

  it('rejects PATCH /v1/scenarios/:scenarioId when merged state has body with 205 statusCode', async () => {
    const existingScenario = {
      id: '11111111-1111-1111-1111-111111111111',
      apiDefinitionId: 'api-1',
      name: 'Success',
      type: 'SUCCESS',
      statusCode: 200,
      headers: {},
      body: { ok: true },
      delayMs: 0,
      isDefault: false,
    };

    let selectIndex = 0;
    const selectRows = [
      [existingScenario],
      [{ id: 'api-1', projectId: 'proj-1' }],
      [{ projectId: 'proj-1', userId: 'user-1', role: 'EDITOR' }],
    ];
    const db = {
      ...createMockDb(existingScenario),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => selectRows[selectIndex++] ?? [],
          }),
        }),
      }),
    } as unknown as Database;

    const app = buildApp({ db, authSecret: 'test-secret-that-is-long-enough' });
    await app.ready();
    const token = app.jwt.sign({ id: 'user-1', email: 'editor@example.test' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/scenarios/${existingScenario.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { statusCode: 205 },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('allows PATCH /v1/scenarios/:scenarioId when statusCode changes to 204 and body is cleared to null', async () => {
    const existingScenario = {
      id: '11111111-1111-1111-1111-111111111111',
      apiDefinitionId: 'api-1',
      name: 'Success',
      type: 'SUCCESS',
      statusCode: 200,
      headers: {},
      body: { ok: true },
      delayMs: 0,
      isDefault: false,
    };

    let selectIndex = 0;
    const selectRows = [
      [existingScenario],
      [{ id: 'api-1', projectId: 'proj-1' }],
      [{ projectId: 'proj-1', userId: 'user-1', role: 'EDITOR' }],
    ];
    const db = {
      ...createMockDb(existingScenario),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => selectRows[selectIndex++] ?? [],
          }),
        }),
      }),
    } as unknown as Database;

    const app = buildApp({ db, authSecret: 'test-secret-that-is-long-enough' });
    await app.ready();
    const token = app.jwt.sign({ id: 'user-1', email: 'editor@example.test' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/scenarios/${existingScenario.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { statusCode: 204, body: null, type: 'EMPTY' },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase('Phase 3 PostgreSQL scenario & requestSchema persistence', () => {
  const connection = createDatabase(databaseUrl!);
  const app = buildApp({
    db: connection.db,
    authSecret: 'integration-test-secret-that-is-long-enough',
  });

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

  it('persists all 8 scenario types, requestSchema, environment mapping, and enforces merged PATCH validation', async () => {
    const register = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'phase3@example.test', password: 'a-long-test-password' },
    });
    expect(register.statusCode).toBe(201);
    const token = register.json().data.token as string;

    const project = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Phase 3 Project', slug: 'phase3-project' },
    });
    expect(project.statusCode).toBe(201);
    const projectId = project.json().data.id as string;

    const api = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/apis`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Create Order',
        method: 'POST',
        path: '/orders',
        requestSchema: {
          type: 'object',
          required: ['sku'],
          properties: { sku: { type: 'string' } },
        },
      },
    });
    expect(api.statusCode).toBe(201);
    const apiId = api.json().data.id as string;

    const scenarioSpecs = [
      { name: 'Success', type: 'SUCCESS', statusCode: 201, body: { ok: true }, isDefault: true },
      { name: 'Empty', type: 'EMPTY', statusCode: 204, body: null },
      { name: 'Unauthorized', type: 'UNAUTHORIZED', statusCode: 401, body: { error: 'unauth' } },
      { name: 'Forbidden', type: 'FORBIDDEN', statusCode: 403, body: { error: 'forbidden' } },
      { name: 'Not Found', type: 'NOT_FOUND', statusCode: 404, body: { error: 'missing' } },
      {
        name: 'Validation Error',
        type: 'VALIDATION_ERROR',
        statusCode: 422,
        body: { error: 'invalid' },
      },
      { name: 'Server Error', type: 'SERVER_ERROR', statusCode: 500, body: { error: 'boom' } },
      { name: 'Custom', type: 'CUSTOM', statusCode: 429, body: { retryAfter: 5 } },
    ];

    let validationScenarioId = '';
    for (const spec of scenarioSpecs) {
      const created = await app.inject({
        method: 'POST',
        url: `/v1/apis/${apiId}/scenarios`,
        headers: { authorization: `Bearer ${token}` },
        payload: spec,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().data.type).toBe(spec.type);
      if (spec.type === 'VALIDATION_ERROR') {
        validationScenarioId = created.json().data.id as string;
      }
    }

    // Merged PATCH validation against real persisted row
    const badPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/scenarios/${validationScenarioId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { statusCode: 205 },
    });
    expect(badPatch.statusCode).toBe(400);
    expect(badPatch.json().error.code).toBe('VALIDATION_ERROR');

    // Environment-to-scenario mapping
    const env = await app.inject({
      method: 'POST',
      url: `/v1/projects/${projectId}/environments`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'staging' },
    });
    expect(env.statusCode).toBe(201);
    const environmentId = env.json().data.id as string;

    const mapScenario = await app.inject({
      method: 'PUT',
      url: `/v1/environments/${environmentId}/apis/${apiId}/scenario`,
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: validationScenarioId },
    });
    expect(mapScenario.statusCode).toBe(200);
    expect(mapScenario.json().data.scenarioId).toBe(validationScenarioId);
  });
});
