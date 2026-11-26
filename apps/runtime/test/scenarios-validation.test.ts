import { describe, expect, it, vi } from 'vitest';
import type { MockEngineRoute } from '@mockflow/mock-engine';
import { buildApp } from '../src/app.js';
import type { ActiveProject, ResolvedEnvironment, RuntimeStore } from '../src/store.js';

function createStore(options: {
  routes: MockEngineRoute[];
  environments?: Record<string, ResolvedEnvironment | null>;
}): RuntimeStore {
  const project: ActiveProject = { id: 'proj-1', slug: 'demo', name: 'Demo' };
  return {
    findActiveProjectBySlug: vi.fn(async (slug) => (slug === 'demo' ? project : null)),
    loadPublishedRoutesForProject: vi.fn(async () => options.routes),
    resolveEnvironment: vi.fn(async (_projectId, key) => options.environments?.[key] ?? null),
    recordRequestLog: vi.fn(async () => undefined),
  };
}

const ordersRoute: MockEngineRoute = {
  id: 'api-orders',
  projectId: 'proj-1',
  name: 'Create Order',
  method: 'POST',
  path: '/orders',
  requestSchema: {
    type: 'object',
    required: ['item', 'quantity'],
    additionalProperties: false,
    properties: {
      item: { type: 'string', minLength: 1 },
      quantity: { type: 'integer', minimum: 1 },
    },
  },
  defaultScenarioId: 'scen-success',
  isPublished: true,
  scenarios: [
    {
      id: 'scen-success',
      apiDefinitionId: 'api-orders',
      projectId: 'proj-1',
      name: 'Success',
      type: 'SUCCESS',
      statusCode: 201,
      headers: {},
      body: { orderId: 'ord-1' },
      delayMs: 0,
      isDefault: true,
    },
    {
      id: 'scen-env-rate',
      apiDefinitionId: 'api-orders',
      projectId: 'proj-1',
      name: 'StagingError',
      type: 'SERVER_ERROR',
      statusCode: 503,
      headers: {},
      body: { error: 'staging-unavailable' },
      delayMs: 0,
      isDefault: false,
    },
    {
      id: 'scen-val-err',
      apiDefinitionId: 'api-orders',
      projectId: 'proj-1',
      name: 'InvalidOrder',
      type: 'VALIDATION_ERROR',
      statusCode: 422,
      headers: {},
      body: { error: 'validation_failed' },
      delayMs: 0,
      isDefault: false,
    },
  ],
};

describe('runtime scenarios, environments, and request validation', () => {
  it('applies scenario precedence: explicit > environment > default', async () => {
    const store = createStore({
      routes: [ordersRoute],
      environments: {
        staging: {
          id: 'env-staging',
          name: 'staging',
          scenarios: { 'api-orders': 'scen-env-rate' },
        },
      },
    });
    const app = buildApp({ store });

    // Default scenario
    const def = await app.inject({
      method: 'POST',
      url: '/p/demo/orders',
      payload: { item: 'book', quantity: 2 },
    });
    expect(def.statusCode).toBe(201);
    expect(def.json()).toEqual({ orderId: 'ord-1' });

    // Environment override
    const env = await app.inject({
      method: 'POST',
      url: '/p/demo/orders',
      headers: { 'x-mockflow-environment': 'staging' },
      payload: { item: 'book', quantity: 2 },
    });
    expect(env.statusCode).toBe(503);
    expect(env.json()).toEqual({ error: 'staging-unavailable' });

    // Explicit scenario overrides environment
    const explicit = await app.inject({
      method: 'POST',
      url: '/p/demo/orders',
      headers: {
        'x-mockflow-environment': 'staging',
        'x-mockflow-scenario-name': 'Success',
      },
      payload: { item: 'book', quantity: 2 },
    });
    expect(explicit.statusCode).toBe(201);
    expect(explicit.json()).toEqual({ orderId: 'ord-1' });
  });

  it('enforces requestSchema validation and selects VALIDATION_ERROR scenario when present', async () => {
    const app = buildApp({ store: createStore({ routes: [ordersRoute] }) });

    const invalid = await app.inject({
      method: 'POST',
      url: '/p/demo/orders',
      payload: { item: '', quantity: 0 },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json()).toEqual({ error: 'validation_failed' });
  });

  it('returns 400 INVALID_REQUEST_BODY when validation fails and no VALIDATION_ERROR scenario exists', async () => {
    const routeWithoutValScenario: MockEngineRoute = {
      ...ordersRoute,
      scenarios: ordersRoute.scenarios.filter((s) => s.type !== 'VALIDATION_ERROR'),
    };
    const app = buildApp({ store: createStore({ routes: [routeWithoutValScenario] }) });

    const invalid = await app.inject({
      method: 'POST',
      url: '/p/demo/orders',
      payload: { item: 'book' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: {
        code: 'INVALID_REQUEST_BODY',
      },
    });
  });

  it('handles missing scenarios and invalid configurations safely', async () => {
    const noScenariosRoute: MockEngineRoute = {
      ...ordersRoute,
      id: 'api-empty',
      path: '/empty',
      requestSchema: null,
      defaultScenarioId: null,
      scenarios: [],
    };
    const brokenResponseRoute: MockEngineRoute = {
      ...ordersRoute,
      id: 'api-broken',
      path: '/broken',
      requestSchema: null,
      defaultScenarioId: 'scen-bad',
      scenarios: [
        {
          id: 'scen-bad',
          apiDefinitionId: 'api-broken',
          projectId: 'proj-1',
          name: 'BadStatus',
          type: 'CUSTOM',
          statusCode: 999,
          headers: {},
          body: {},
          delayMs: 0,
          isDefault: true,
        },
      ],
    };

    const app = buildApp({
      store: createStore({ routes: [noScenariosRoute, brokenResponseRoute] }),
    });

    const missingScenario = await app.inject({ method: 'POST', url: '/p/demo/empty' });
    expect(missingScenario.statusCode).toBe(404);
    expect(missingScenario.json()).toMatchObject({ error: { code: 'NO_SCENARIOS_AVAILABLE' } });

    const invalidScenario = await app.inject({
      method: 'POST',
      url: '/p/demo/empty',
      headers: { 'x-mockflow-scenario': 'does-not-exist' },
    });
    expect(invalidScenario.statusCode).toBe(404);

    const broken = await app.inject({ method: 'POST', url: '/p/demo/broken' });
    expect(broken.statusCode).toBe(500);
    expect(broken.json()).toMatchObject({ error: { code: 'MOCK_CONFIGURATION_ERROR' } });
  });
});
