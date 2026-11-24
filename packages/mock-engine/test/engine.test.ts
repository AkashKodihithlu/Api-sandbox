import { describe, expect, it, vi } from 'vitest';
import {
  createMockEngine,
  executeMockEngine,
  MockEngine,
  MockEngineError,
  type MockEngineRoute,
  type MockScenario,
} from '../src/index.js';

describe('Unified MockEngine Integration', () => {
  const userScenarios: MockScenario[] = [
    {
      id: 'sc-users-list-200',
      apiDefinitionId: 'api-users-list',
      name: 'List Users Success',
      statusCode: 200,
      headers: { 'x-total-count': '2' },
      body: [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ],
      delayMs: 15,
      isDefault: true,
    },
    {
      id: 'sc-users-list-empty',
      apiDefinitionId: 'api-users-list',
      name: 'Empty Users List',
      statusCode: 200,
      body: [],
      delayMs: 0,
      isDefault: false,
    },
    {
      id: 'sc-users-list-error',
      apiDefinitionId: 'api-users-list',
      name: 'Database Error',
      statusCode: 500,
      body: { error: 'Database unavailable' },
      delayMs: 0,
      isDefault: false,
    },
  ];

  const userDetailScenarios: MockScenario[] = [
    {
      id: 'sc-user-detail-200',
      apiDefinitionId: 'api-user-detail',
      name: 'User Detail Found',
      statusCode: 200,
      body: { id: 'mocked', username: 'sample-user' },
      delayMs: 0,
      isDefault: true,
    },
    {
      id: 'sc-user-detail-404',
      apiDefinitionId: 'api-user-detail',
      name: 'User Not Found',
      statusCode: 404,
      body: { error: 'User does not exist' },
      delayMs: 0,
    },
    {
      id: 'sc-user-detail-bad-header',
      apiDefinitionId: 'api-user-detail',
      name: 'Prohibited Header Scenario',
      statusCode: 200,
      headers: { Connection: 'keep-alive' },
      body: { ok: false },
    },
  ];

  const routes: MockEngineRoute[] = [
    {
      id: 'api-users-list',
      method: 'GET',
      path: '/api/v1/users',
      defaultScenarioId: 'sc-users-list-200',
      scenarios: userScenarios,
    },
    {
      id: 'api-user-detail',
      method: 'GET',
      path: '/api/v1/users/:userId',
      defaultScenarioId: 'sc-user-detail-200',
      scenarios: userDetailScenarios,
    },
    {
      id: 'api-user-posts',
      method: 'GET',
      path: '/api/v1/users/:userId/posts/:postId',
      defaultScenarioId: 'sc-user-post-200',
      scenarios: [
        {
          id: 'sc-user-post-200',
          apiDefinitionId: 'api-user-posts',
          name: 'Post Found',
          statusCode: 200,
          body: { postId: '101', title: 'Hello World' },
          isDefault: true,
        },
      ],
    },
    {
      id: 'api-user-create',
      method: 'POST',
      path: '/api/v1/users',
      defaultScenarioId: 'sc-user-create-201',
      scenarios: [
        {
          id: 'sc-user-create-201',
          apiDefinitionId: 'api-user-create',
          name: 'User Created',
          statusCode: 201,
          body: { id: 'new-123', created: true },
          isDefault: true,
        },
      ],
    },
    {
      id: 'api-no-scenarios',
      method: 'GET',
      path: '/api/v1/empty',
      scenarios: [],
    },
  ];

  describe('End-to-end execution', () => {
    it('executes the full pipeline for a matched route using default scenario', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users',
      });

      expect(result.status).toBe('MATCHED');
      expect(result.matched).toBe(true);

      if (result.status === 'MATCHED') {
        expect(result.route.id).toBe('api-users-list');
        expect(result.params).toEqual({});
        expect(result.scenario.id).toBe('sc-users-list-200');
        expect(result.resolutionReason).toBe('default');
        expect(result.response.statusCode).toBe(200);
        expect(result.response.headers['x-total-count']).toBe('2');
        expect(result.response.headers['x-content-type-options']).toBe('nosniff');
        expect(result.response.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(result.response.body).toBe(JSON.stringify(userScenarios[0].body));
        expect(result.response.delayMs).toBe(15);
      }
    });

    it('extracts path parameters during execution', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/user-42',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.route.id).toBe('api-user-detail');
        expect(result.params).toEqual({ userId: 'user-42' });
        expect(result.response.statusCode).toBe(200);
      }
    });

    it('extracts multiple path parameters across nested routes', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/alice/posts/post-99',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.route.id).toBe('api-user-posts');
        expect(result.params).toEqual({
          userId: 'alice',
          postId: 'post-99',
        });
        expect(result.response.statusCode).toBe(200);
      }
    });

    it('works with the executeMockEngine convenience function', () => {
      const result = executeMockEngine(routes, {
        method: 'POST',
        path: '/api/v1/users',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.route.id).toBe('api-user-create');
        expect(result.response.statusCode).toBe(201);
      }
    });

    it('supports executeOrThrow returning success directly', () => {
      const engine = createMockEngine({ routes });

      const success = engine.executeOrThrow({
        method: 'GET',
        path: '/api/v1/users',
      });

      expect(success.status).toBe('MATCHED');
      expect(success.route.id).toBe('api-users-list');
      expect(success.response.statusCode).toBe(200);
    });
  });

  describe('Scenario selection in the unified engine', () => {
    it('supports explicit scenario selection via request property explicitScenarioId', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users',
        explicitScenarioId: 'sc-users-list-empty',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-users-list-empty');
        expect(result.resolutionReason).toBe('explicit');
        expect(result.response.body).toBe('[]');
      }
    });

    it('supports explicit scenario selection via request property explicitScenarioName', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/user-1',
        explicitScenarioName: 'User Not Found',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-user-detail-404');
        expect(result.resolutionReason).toBe('explicit');
        expect(result.response.statusCode).toBe(404);
      }
    });

    it('supports explicit scenario selection via header x-mockflow-scenario', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users',
        headers: {
          'x-mockflow-scenario': 'sc-users-list-error',
        },
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-users-list-error');
        expect(result.resolutionReason).toBe('explicit');
        expect(result.response.statusCode).toBe(500);
      }
    });

    it('supports explicit scenario name selection via header x-mockflow-scenario-name', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/user-1',
        headers: {
          'x-mockflow-scenario-name': 'User Not Found',
        },
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-user-detail-404');
        expect(result.resolutionReason).toBe('explicit');
        expect(result.response.statusCode).toBe(404);
      }
    });

    it('supports environment-based scenario mapping via engineOptions', () => {
      const engine = createMockEngine({
        routes,
        environmentScenarios: {
          'api-users-list': 'sc-users-list-empty',
        },
        environmentId: 'env-testing',
      });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-users-list-empty');
        expect(result.resolutionReason).toBe('environment');
      }
    });

    it('supports environment-based scenario mapping via call options', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute(
        {
          method: 'GET',
          path: '/api/v1/users',
        },
        {
          environmentScenarios: {
            'api-users-list': 'sc-users-list-error',
          },
        },
      );

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-users-list-error');
        expect(result.resolutionReason).toBe('environment');
      }
    });

    it('prioritizes explicit selection over environment mapping', () => {
      const engine = createMockEngine({
        routes,
        environmentScenarios: {
          'api-users-list': 'sc-users-list-error',
        },
      });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users',
        explicitScenarioId: 'sc-users-list-empty',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-users-list-empty');
        expect(result.resolutionReason).toBe('explicit');
      }
    });

    it('falls back to first scenario when allowFallback is enabled and no default is set', () => {
      const noDefaultRoute: MockEngineRoute = {
        id: 'api-fallback',
        method: 'GET',
        path: '/fallback',
        defaultScenarioId: null,
        scenarios: [
          {
            id: 'sc-fallback-1',
            apiDefinitionId: 'api-fallback',
            name: 'Fallback First',
            statusCode: 200,
            body: { first: true },
            isDefault: false,
          },
        ],
      };

      const engine = createMockEngine({
        routes: [noDefaultRoute],
        allowFallback: true,
      });

      const result = engine.execute({
        method: 'GET',
        path: '/fallback',
      });

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.scenario.id).toBe('sc-fallback-1');
        expect(result.resolutionReason).toBe('fallback');
      }
    });
  });

  describe('Route-not-found handling', () => {
    it('returns structured ROUTE_NOT_FOUND when path does not match any route', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/unknown',
      });

      expect(result.status).toBe('ROUTE_NOT_FOUND');
      expect(result.matched).toBe(false);
      if (result.status === 'ROUTE_NOT_FOUND') {
        expect(result.error.code).toBe('ROUTE_NOT_FOUND');
        expect(result.error.details?.path).toBe('/api/v1/unknown');
      }
    });

    it('returns structured ROUTE_NOT_FOUND when HTTP method does not match', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'DELETE',
        path: '/api/v1/users',
      });

      expect(result.status).toBe('ROUTE_NOT_FOUND');
      expect(result.matched).toBe(false);
    });

    it('handles malformed URL percent encoding safely without crashing', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/%',
      });

      expect(result.status).toBe('ROUTE_NOT_FOUND');
      expect(result.matched).toBe(false);
      if (result.status === 'ROUTE_NOT_FOUND') {
        expect(result.error.code).toBe('ROUTE_NOT_FOUND');
        expect(result.error.message).toContain('Malformed URL path encoding');
      }
    });

    it('handles path traversal injection safely as ROUTE_NOT_FOUND', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/..',
      });

      expect(result.status).toBe('ROUTE_NOT_FOUND');
      expect(result.matched).toBe(false);
    });

    it('throws MockEngineError with status ROUTE_NOT_FOUND when executeOrThrow fails', () => {
      const engine = createMockEngine({ routes });

      expect(() =>
        engine.executeOrThrow({
          method: 'GET',
          path: '/unknown',
        }),
      ).toThrowError(MockEngineError);

      try {
        engine.executeOrThrow({
          method: 'GET',
          path: '/unknown',
        });
      } catch (err) {
        expect(err instanceof MockEngineError).toBe(true);
        const engineErr = err as MockEngineError;
        expect(engineErr.status).toBe('ROUTE_NOT_FOUND');
        expect(engineErr.code).toBe('ROUTE_NOT_FOUND');
      }
    });
  });

  describe('Scenario resolution failure handling', () => {
    it('returns SCENARIO_RESOLUTION_FAILED when no scenarios exist for route', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/empty',
      });

      expect(result.status).toBe('SCENARIO_RESOLUTION_FAILED');
      expect(result.matched).toBe(true);
      if (result.status === 'SCENARIO_RESOLUTION_FAILED') {
        expect(result.route.id).toBe('api-no-scenarios');
        expect(result.error.code).toBe('NO_SCENARIOS_AVAILABLE');
      }
    });

    it('returns SCENARIO_RESOLUTION_FAILED when explicit scenario is not found', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users',
        explicitScenarioId: 'non-existent-scenario',
      });

      expect(result.status).toBe('SCENARIO_RESOLUTION_FAILED');
      expect(result.matched).toBe(true);
      if (result.status === 'SCENARIO_RESOLUTION_FAILED') {
        expect(result.error.code).toBe('SCENARIO_NOT_FOUND');
      }
    });

    it('returns SCENARIO_RESOLUTION_FAILED when scenario belongs to another API', () => {
      const crossApiRoute: MockEngineRoute = {
        id: 'api-target',
        method: 'GET',
        path: '/target',
        defaultScenarioId: 'sc-foreign',
        scenarios: [
          {
            id: 'sc-foreign',
            apiDefinitionId: 'api-other', // Belongs to different API!
            name: 'Mismatched Scenario',
            statusCode: 200,
          },
        ],
      };

      const engine = createMockEngine({ routes: [crossApiRoute] });
      const result = engine.execute({
        method: 'GET',
        path: '/target',
      });

      expect(result.status).toBe('SCENARIO_RESOLUTION_FAILED');
      if (result.status === 'SCENARIO_RESOLUTION_FAILED') {
        expect(result.error.code).toBe('SCENARIO_MISMATCH');
      }
    });

    it('throws MockEngineError with status SCENARIO_RESOLUTION_FAILED in executeOrThrow', () => {
      const engine = createMockEngine({ routes });

      expect(() =>
        engine.executeOrThrow({
          method: 'GET',
          path: '/api/v1/empty',
        }),
      ).toThrowError(MockEngineError);

      try {
        engine.executeOrThrow({
          method: 'GET',
          path: '/api/v1/empty',
        });
      } catch (err) {
        expect(err instanceof MockEngineError).toBe(true);
        const engineErr = err as MockEngineError;
        expect(engineErr.status).toBe('SCENARIO_RESOLUTION_FAILED');
        expect(engineErr.code).toBe('NO_SCENARIOS_AVAILABLE');
      }
    });
  });

  describe('Response execution failure handling', () => {
    it('returns RESPONSE_EXECUTION_FAILED when scenario has prohibited headers', () => {
      const engine = createMockEngine({ routes });

      const result = engine.execute({
        method: 'GET',
        path: '/api/v1/users/user-1',
        explicitScenarioId: 'sc-user-detail-bad-header',
      });

      expect(result.status).toBe('RESPONSE_EXECUTION_FAILED');
      expect(result.matched).toBe(true);
      if (result.status === 'RESPONSE_EXECUTION_FAILED') {
        expect(result.scenario.id).toBe('sc-user-detail-bad-header');
        expect(result.error.code).toBe('PROHIBITED_HEADER');
      }
    });

    it('returns RESPONSE_EXECUTION_FAILED when body exceeds maximum size limit', () => {
      const oversizedRoute: MockEngineRoute = {
        id: 'api-large',
        method: 'GET',
        path: '/large',
        defaultScenarioId: 'sc-large',
        scenarios: [
          {
            id: 'sc-large',
            apiDefinitionId: 'api-large',
            name: 'Oversized',
            statusCode: 200,
            body: 'x'.repeat(100),
          },
        ],
      };

      const engine = createMockEngine({
        routes: [oversizedRoute],
        maxBodyBytes: 50,
      });

      const result = engine.execute({
        method: 'GET',
        path: '/large',
      });

      expect(result.status).toBe('RESPONSE_EXECUTION_FAILED');
      if (result.status === 'RESPONSE_EXECUTION_FAILED') {
        expect(result.error.code).toBe('BODY_SIZE_EXCEEDED');
      }
    });

    it('throws MockEngineError with status RESPONSE_EXECUTION_FAILED in executeOrThrow', () => {
      const engine = createMockEngine({ routes });

      expect(() =>
        engine.executeOrThrow({
          method: 'GET',
          path: '/api/v1/users/user-1',
          explicitScenarioId: 'sc-user-detail-bad-header',
        }),
      ).toThrowError(MockEngineError);

      try {
        engine.executeOrThrow({
          method: 'GET',
          path: '/api/v1/users/user-1',
          explicitScenarioId: 'sc-user-detail-bad-header',
        });
      } catch (err) {
        expect(err instanceof MockEngineError).toBe(true);
        const engineErr = err as MockEngineError;
        expect(engineErr.status).toBe('RESPONSE_EXECUTION_FAILED');
        expect(engineErr.code).toBe('PROHIBITED_HEADER');
      }
    });
  });

  describe('Artificial delay handling in unified engine', () => {
    it('executes delay deterministically with sleeper spy using executeWithDelay', async () => {
      const sleeperSpy = vi.fn().mockResolvedValue(undefined);

      const engine = createMockEngine({ routes });

      const result = await engine.executeWithDelay(
        {
          method: 'GET',
          path: '/api/v1/users',
        },
        {
          sleeper: sleeperSpy,
        },
      );

      expect(result.status).toBe('MATCHED');
      if (result.status === 'MATCHED') {
        expect(result.response.delayMs).toBe(15);
        expect(sleeperSpy).toHaveBeenCalledTimes(1);
        expect(sleeperSpy).toHaveBeenCalledWith(15);
      }
    });

    it('skips sleeper when delayMs is 0 in executeWithDelay', async () => {
      const sleeperSpy = vi.fn().mockResolvedValue(undefined);

      const engine = createMockEngine({ routes });

      const result = await engine.executeWithDelay(
        {
          method: 'GET',
          path: '/api/v1/users',
          explicitScenarioId: 'sc-users-list-empty', // delayMs: 0
        },
        {
          sleeper: sleeperSpy,
        },
      );

      expect(result.status).toBe('MATCHED');
      expect(sleeperSpy).not.toHaveBeenCalled();
    });
  });
});
