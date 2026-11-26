import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@mockflow/db';
import { DrizzleRuntimeStore } from '../src/store.js';

function createMockSelectDb(steps: Array<{ rows?: unknown[]; error?: Error }>) {
  let index = 0;
  const selectSpy = vi.fn(() => {
    const step = steps[index++] ?? { rows: [] };
    const resultPromise = step.error
      ? Promise.reject(step.error)
      : Promise.resolve(step.rows ?? []);
    return {
      from: () => ({
        where: () => ({
          limit: () => resultPromise,
          orderBy: () => resultPromise,
          then: resultPromise.then.bind(resultPromise),
          catch: resultPromise.catch.bind(resultPromise),
        }),
      }),
    };
  });

  const insertValuesSpy = vi.fn(async () => []);
  const insertSpy = vi.fn(() => ({
    values: insertValuesSpy,
  }));

  return {
    db: { select: selectSpy, insert: insertSpy } as unknown as Database,
    selectSpy,
    insertSpy,
    insertValuesSpy,
  };
}

describe('DrizzleRuntimeStore', () => {
  it('resolves an active project by slug and rejects empty or oversized slugs', async () => {
    const { db, selectSpy } = createMockSelectDb([
      { rows: [{ id: 'proj-1', slug: 'demo-app', name: 'Demo App' }] },
      { rows: [] },
    ]);
    const store = new DrizzleRuntimeStore(db);

    await expect(store.findActiveProjectBySlug(' demo-app ')).resolves.toEqual({
      id: 'proj-1',
      slug: 'demo-app',
      name: 'Demo App',
    });
    await expect(store.findActiveProjectBySlug('missing')).resolves.toBeNull();
    await expect(store.findActiveProjectBySlug('   ')).resolves.toBeNull();
    await expect(store.findActiveProjectBySlug('a'.repeat(81))).resolves.toBeNull();
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty routes without querying scenarios when no published APIs exist', async () => {
    const { db, selectSpy } = createMockSelectDb([{ rows: [] }]);
    const store = new DrizzleRuntimeStore(db);

    await expect(store.loadPublishedRoutesForProject('proj-1')).resolves.toEqual([]);
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it('loads published APIs and groups scenarios in a single batch query', async () => {
    const { db, selectSpy } = createMockSelectDb([
      {
        rows: [
          {
            id: 'api-1',
            projectId: 'proj-1',
            name: 'Get Users',
            method: 'GET',
            path: '/users',
            requestSchema: null,
            defaultScenarioId: 'scen-1',
            isPublished: true,
          },
          {
            id: 'api-2',
            projectId: 'proj-1',
            name: 'Create User',
            method: 'POST',
            path: '/users',
            requestSchema: { type: 'object' },
            defaultScenarioId: null,
            isPublished: true,
          },
        ],
      },
      {
        rows: [
          {
            id: 'scen-1',
            apiDefinitionId: 'api-1',
            name: 'Success',
            type: 'SUCCESS',
            statusCode: 200,
            headers: { 'x-mock': '1' },
            body: { users: [] },
            delayMs: 0,
            isDefault: true,
          },
        ],
      },
    ]);
    const store = new DrizzleRuntimeStore(db);

    const routes = await store.loadPublishedRoutesForProject('proj-1');
    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      id: 'api-1',
      method: 'GET',
      path: '/users',
      defaultScenarioId: 'scen-1',
    });
    expect(routes[0].scenarios).toHaveLength(1);
    expect(routes[0].scenarios[0]).toMatchObject({
      id: 'scen-1',
      projectId: 'proj-1',
      headers: { 'x-mock': '1' },
    });
    expect(routes[1].scenarios).toEqual([]);
  });

  it('resolves environment mappings and returns null for unknown environments', async () => {
    const { db } = createMockSelectDb([
      { rows: [{ id: '11111111-1111-1111-1111-111111111111', name: 'staging' }] },
      { rows: [{ apiDefinitionId: 'api-1', scenarioId: 'scen-2' }] },
      { rows: [] },
    ]);
    const store = new DrizzleRuntimeStore(db);

    await expect(store.resolveEnvironment('proj-1', 'staging')).resolves.toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'staging',
      scenarios: { 'api-1': 'scen-2' },
    });
    await expect(store.resolveEnvironment('proj-1', 'unknown')).resolves.toBeNull();
    await expect(store.resolveEnvironment('proj-1', '')).resolves.toBeNull();
  });

  it('records request log entries with bounded numeric fields', async () => {
    const { db, insertSpy, insertValuesSpy } = createMockSelectDb([]);
    const store = new DrizzleRuntimeStore(db);

    await store.recordRequestLog({
      projectId: 'proj-1',
      apiDefinitionId: 'api-1',
      scenarioId: 'scen-1',
      method: 'GET',
      path: '/users',
      statusCode: 200,
      durationMs: 12.7,
      requestBytes: -5,
      responseBytes: 42,
      redactedHeaders: { authorization: '[REDACTED]' },
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        durationMs: 13,
        requestBytes: 0,
        responseBytes: 42,
        redactedHeaders: { authorization: '[REDACTED]' },
      }),
    );
  });

  it('propagates database errors rather than swallowing them', async () => {
    const { db } = createMockSelectDb([{ error: new Error('connection refused') }]);
    const store = new DrizzleRuntimeStore(db);

    await expect(store.findActiveProjectBySlug('demo-app')).rejects.toThrow('connection refused');
  });
});
