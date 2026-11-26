import { describe, expect, it, vi } from 'vitest';
import type { MockEngineRoute } from '@mockflow/mock-engine';
import { buildApp } from '../src/app.js';
import type { ActiveProject, RuntimeStore } from '../src/store.js';

function createMemoryStore(
  config: {
    projects?: Record<string, ActiveProject | null>;
    routesByProject?: Record<string, MockEngineRoute[]>;
  } = {},
): RuntimeStore {
  return {
    findActiveProjectBySlug: vi.fn(async (slug: string) => config.projects?.[slug] ?? null),
    loadPublishedRoutesForProject: vi.fn(
      async (projectId: string) => config.routesByProject?.[projectId] ?? [],
    ),
    resolveEnvironment: vi.fn(async () => null),
    recordRequestLog: vi.fn(async () => undefined),
  };
}

const sampleRoutes: MockEngineRoute[] = [
  {
    id: 'api-list-users',
    projectId: 'proj-1',
    name: 'List Users',
    method: 'GET',
    path: '/users',
    defaultScenarioId: 'scen-users-ok',
    isPublished: true,
    scenarios: [
      {
        id: 'scen-users-ok',
        apiDefinitionId: 'api-list-users',
        projectId: 'proj-1',
        name: 'Success',
        type: 'SUCCESS',
        statusCode: 200,
        headers: { 'x-mock-source': 'static-route' },
        body: { users: [{ id: '1' }] },
        delayMs: 0,
        isDefault: true,
      },
    ],
  },
  {
    id: 'api-user-by-id',
    projectId: 'proj-1',
    name: 'Get User',
    method: 'GET',
    path: '/users/:userId',
    defaultScenarioId: 'scen-user-ok',
    isPublished: true,
    scenarios: [
      {
        id: 'scen-user-ok',
        apiDefinitionId: 'api-user-by-id',
        projectId: 'proj-1',
        name: 'Success',
        type: 'SUCCESS',
        statusCode: 200,
        headers: {},
        body: { id: 'param-matched' },
        delayMs: 0,
        isDefault: true,
      },
    ],
  },
  {
    id: 'api-user-me',
    projectId: 'proj-1',
    name: 'Get Current User',
    method: 'GET',
    path: '/users/me',
    defaultScenarioId: 'scen-user-me',
    isPublished: true,
    scenarios: [
      {
        id: 'scen-user-me',
        apiDefinitionId: 'api-user-me',
        projectId: 'proj-1',
        name: 'Me',
        type: 'SUCCESS',
        statusCode: 200,
        headers: {},
        body: { id: 'me-static' },
        delayMs: 0,
        isDefault: true,
      },
    ],
  },
  {
    id: 'api-create-user',
    projectId: 'proj-1',
    name: 'Create User',
    method: 'POST',
    path: '/users',
    defaultScenarioId: 'scen-user-created',
    isPublished: true,
    scenarios: [
      {
        id: 'scen-user-created',
        apiDefinitionId: 'api-create-user',
        projectId: 'proj-1',
        name: 'Created',
        type: 'SUCCESS',
        statusCode: 201,
        headers: { 'x-created': 'true' },
        body: { created: true },
        delayMs: 0,
        isDefault: true,
      },
    ],
  },
];

describe('mock runtime HTTP execution', () => {
  it('serves exact routes, parameterized routes, and static route precedence', async () => {
    const store = createMemoryStore({
      projects: { demo: { id: 'proj-1', slug: 'demo', name: 'Demo' } },
      routesByProject: { 'proj-1': sampleRoutes },
    });
    const app = buildApp({ store });

    const exact = await app.inject({ method: 'GET', url: '/p/demo/users?page=1' });
    expect(exact.statusCode).toBe(200);
    expect(exact.headers['x-mock-source']).toBe('static-route');
    expect(exact.headers['x-content-type-options']).toBe('nosniff');
    expect(exact.json()).toEqual({ users: [{ id: '1' }] });

    const staticWins = await app.inject({ method: 'GET', url: '/p/demo/users/me' });
    expect(staticWins.statusCode).toBe(200);
    expect(staticWins.json()).toEqual({ id: 'me-static' });

    const paramMatch = await app.inject({ method: 'GET', url: '/p/demo/users/42' });
    expect(paramMatch.statusCode).toBe(200);
    expect(paramMatch.json()).toEqual({ id: 'param-matched' });

    const postMatch = await app.inject({
      method: 'POST',
      url: '/p/demo/users',
      headers: { 'content-type': 'application/json', 'x-custom': 'abc' },
      payload: { name: 'Ada' },
    });
    expect(postMatch.statusCode).toBe(201);
    expect(postMatch.headers['x-created']).toBe('true');
    expect(postMatch.json()).toEqual({ created: true });
  });

  it('returns 404 for unknown projects, unmatched routes, and unsupported methods', async () => {
    const store = createMemoryStore({
      projects: { demo: { id: 'proj-1', slug: 'demo', name: 'Demo' } },
      routesByProject: { 'proj-1': sampleRoutes },
    });
    const app = buildApp({ store });

    const unknownProject = await app.inject({ method: 'GET', url: '/p/missing/users' });
    expect(unknownProject.statusCode).toBe(404);
    expect(unknownProject.json()).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });

    const unmatched = await app.inject({ method: 'GET', url: '/p/demo/nonexistent' });
    expect(unmatched.statusCode).toBe(404);
    expect(unmatched.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });

    const wrongMethod = await app.inject({ method: 'DELETE', url: '/p/demo/users' });
    expect(wrongMethod.statusCode).toBe(404);
    expect(wrongMethod.json()).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
  });
});
