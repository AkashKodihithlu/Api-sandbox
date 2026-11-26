import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Database } from '../src/db/client.js';

function createApiPatchMockDb(options: { scenariosForApi?: Array<{ id: string }> }) {
  let selectIndex = 0;
  const selectRows = [
    [{ id: 'api-1', projectId: 'proj-1' }],
    [{ projectId: 'proj-1', userId: 'user-1', role: 'EDITOR' }],
    options.scenariosForApi ?? [],
  ];

  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectRows[selectIndex++] ?? [],
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: 'api-1', projectId: 'proj-1', isPublished: true }],
        }),
      }),
    }),
  } as unknown as Database;

  return db;
}

describe('control-plane publish & defaultScenarioId validation', () => {
  it('rejects publishing an API with no scenarios', async () => {
    const db = createApiPatchMockDb({ scenariosForApi: [] });
    const app = buildApp({ db, authSecret: 'test-secret-that-is-long-enough' });
    await app.ready();
    const token = app.jwt.sign({ id: 'user-1', email: 'editor@example.test' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/apis/api-1',
      headers: { authorization: `Bearer ${token}` },
      payload: { isPublished: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Add at least one response scenario before publishing an API definition',
      },
    });
  });

  it('rejects setting a defaultScenarioId that does not belong to the API', async () => {
    const db = createApiPatchMockDb({ scenariosForApi: [] });
    const app = buildApp({ db, authSecret: 'test-secret-that-is-long-enough' });
    await app.ready();
    const token = app.jwt.sign({ id: 'user-1', email: 'editor@example.test' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/apis/api-1',
      headers: { authorization: `Bearer ${token}` },
      payload: { defaultScenarioId: '11111111-1111-4111-8111-111111111111' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Default scenario must belong to this API definition',
      },
    });
  });

  it('allows publishing an API when at least one scenario exists', async () => {
    const db = createApiPatchMockDb({ scenariosForApi: [{ id: 'scen-1' }] });
    const app = buildApp({ db, authSecret: 'test-secret-that-is-long-enough' });
    await app.ready();
    const token = app.jwt.sign({ id: 'user-1', email: 'editor@example.test' });

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/apis/api-1',
      headers: { authorization: `Bearer ${token}` },
      payload: { isPublished: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: 'api-1', isPublished: true } });
  });
});
