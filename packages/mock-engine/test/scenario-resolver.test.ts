import { describe, expect, it } from 'vitest';
import {
  matchRoute,
  resolveScenario,
  resolveScenarioResult,
  resolveScenarioWithReason,
  ScenarioResolutionError,
  type MockApiDefinition,
  type MockScenario,
  type RouteDefinition,
} from '../src/index.js';

describe('Scenario Resolver', () => {
  const api1: MockApiDefinition = {
    id: 'api-users-list',
    projectId: 'project-alpha',
    name: 'List Users',
    method: 'GET',
    path: '/users',
    defaultScenarioId: 'scenario-users-200',
  };

  const scenarioSuccess: MockScenario = {
    id: 'scenario-users-200',
    apiDefinitionId: 'api-users-list',
    projectId: 'project-alpha',
    name: 'Success - 200 OK',
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: [{ id: '1', name: 'Alice' }],
    delayMs: 50,
    isDefault: true,
  };

  const scenarioCreated: MockScenario = {
    id: 'scenario-users-201',
    apiDefinitionId: 'api-users-list',
    projectId: 'project-alpha',
    name: 'Created - 201',
    statusCode: 201,
    headers: { 'content-type': 'application/json' },
    body: { id: '2', name: 'Bob' },
    delayMs: 0,
    isDefault: false,
  };

  const scenarioError: MockScenario = {
    id: 'scenario-users-500',
    apiDefinitionId: 'api-users-list',
    projectId: 'project-alpha',
    name: 'Server Error - 500',
    statusCode: 500,
    headers: { 'content-type': 'application/json' },
    body: { error: 'Internal server error' },
    delayMs: 200,
    isDefault: false,
  };

  const standardScenarios: MockScenario[] = [scenarioSuccess, scenarioCreated, scenarioError];

  describe('Precedence hierarchy', () => {
    it('prioritizes explicit scenario ID over environment and default scenarios', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioId: scenarioError.id,
        environmentScenarioId: scenarioCreated.id,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioError.id);
        expect(result.reason).toBe('explicit');
      }
    });

    it('prioritizes explicit scenario name over environment and default scenarios', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioName: 'Created - 201',
        environmentScenarioId: scenarioError.id,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioCreated.id);
        expect(result.reason).toBe('explicit');
      }
    });

    it('prioritizes environment-mapped scenario over API default and fallback when no explicit is set', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarioId: scenarioCreated.id,
        allowFallback: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioCreated.id);
        expect(result.reason).toBe('environment');
      }
    });

    it('resolves API default scenario when neither explicit nor environment selection is provided', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioSuccess.id);
        expect(result.reason).toBe('default');
      }
    });

    it('resolves scenario with isDefault: true if api.defaultScenarioId is not set', () => {
      const apiWithoutDefaultId: MockApiDefinition = {
        id: 'api-users-list',
        projectId: 'project-alpha',
        defaultScenarioId: null,
      };

      const result = resolveScenarioResult({
        api: apiWithoutDefaultId,
        scenarios: standardScenarios,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioSuccess.id);
        expect(result.reason).toBe('default');
      }
    });

    it('uses fallback to first scenario when no default is set and allowFallback is true', () => {
      const noDefaultScenarios: MockScenario[] = [
        { ...scenarioCreated, isDefault: false },
        { ...scenarioError, isDefault: false },
      ];
      const apiNoDefault: MockApiDefinition = {
        id: 'api-users-list',
        defaultScenarioId: null,
      };

      const result = resolveScenarioResult({
        api: apiNoDefault,
        scenarios: noDefaultScenarios,
        allowFallback: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioCreated.id);
        expect(result.reason).toBe('fallback');
      }
    });

    it('fails with NO_DEFAULT_SCENARIO when no default exists and allowFallback is false', () => {
      const noDefaultScenarios: MockScenario[] = [
        { ...scenarioCreated, isDefault: false },
        { ...scenarioError, isDefault: false },
      ];
      const apiNoDefault: MockApiDefinition = {
        id: 'api-users-list',
        defaultScenarioId: null,
      };

      const result = resolveScenarioResult({
        api: apiNoDefault,
        scenarios: noDefaultScenarios,
        allowFallback: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_DEFAULT_SCENARIO');
      }
    });
  });

  describe('Explicit scenario selection', () => {
    it('resolves successfully when both explicit ID and Name refer to the same scenario', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioId: scenarioCreated.id,
        explicitScenarioName: scenarioCreated.name,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioCreated.id);
        expect(result.reason).toBe('explicit');
      }
    });

    it('fails with INVALID_CONFIGURATION when explicit ID and Name conflict', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioId: scenarioCreated.id,
        explicitScenarioName: scenarioError.name,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CONFIGURATION');
      }
    });

    it('fails with SCENARIO_NOT_FOUND when explicitScenarioId does not exist', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioId: 'non-existent-id',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCENARIO_NOT_FOUND');
        expect(result.error.details?.explicitScenarioId).toBe('non-existent-id');
      }
    });

    it('fails with SCENARIO_NOT_FOUND when explicitScenarioName does not exist', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioName: 'Does Not Exist',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCENARIO_NOT_FOUND');
      }
    });

    it('fails with INVALID_CONFIGURATION if multiple scenarios share the same name during explicit name lookup', () => {
      const duplicateNameScenarios: MockScenario[] = [
        { ...scenarioSuccess, id: 'scenario-1', name: 'Duplicate' },
        { ...scenarioCreated, id: 'scenario-2', name: 'Duplicate' },
      ];

      const result = resolveScenarioResult({
        api: api1,
        scenarios: duplicateNameScenarios,
        explicitScenarioName: 'Duplicate',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CONFIGURATION');
      }
    });

    it('ignores empty string or whitespace-only explicit selectors and falls through', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        explicitScenarioId: '   ',
        explicitScenarioName: '',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioSuccess.id);
        expect(result.reason).toBe('default');
      }
    });
  });

  describe('Environment-based selection', () => {
    it('resolves scenario via direct environmentScenarioId', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarioId: scenarioError.id,
        environmentId: 'env-staging',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioError.id);
        expect(result.reason).toBe('environment');
      }
    });

    it('resolves scenario via environmentScenarios dictionary matching api.id', () => {
      const environmentMapping = {
        'api-users-list': scenarioCreated.id,
        'other-api': 'other-scenario',
      };

      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarios: environmentMapping,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioCreated.id);
        expect(result.reason).toBe('environment');
      }
    });

    it('resolves scenario via environmentScenarios Map matching api.id', () => {
      const map = new Map<string, string>([['api-users-list', scenarioError.id]]);

      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarios: map,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioError.id);
        expect(result.reason).toBe('environment');
      }
    });

    it('fails with SCENARIO_NOT_FOUND when environmentScenarioId does not exist in scenarios', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarioId: 'missing-scenario-id',
        environmentId: 'env-prod',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCENARIO_NOT_FOUND');
        expect(result.error.details?.environmentScenarioId).toBe('missing-scenario-id');
      }
    });

    it('falls through to default when environmentScenarios map has no entry for this API', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarios: { 'unrelated-api': 'some-scenario' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe(scenarioSuccess.id);
        expect(result.reason).toBe('default');
      }
    });
  });

  describe('API Default scenario selection', () => {
    it('fails with SCENARIO_NOT_FOUND if api.defaultScenarioId points to a non-existent scenario', () => {
      const brokenApi: MockApiDefinition = {
        id: 'api-users-list',
        defaultScenarioId: 'deleted-scenario-id',
      };

      const result = resolveScenarioResult({
        api: brokenApi,
        scenarios: standardScenarios,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCENARIO_NOT_FOUND');
      }
    });

    it('fails with INVALID_CONFIGURATION if multiple scenarios are flagged as isDefault: true', () => {
      const conflictingDefaults: MockScenario[] = [
        { ...scenarioSuccess, id: 'sc-1', isDefault: true },
        { ...scenarioCreated, id: 'sc-2', isDefault: true },
      ];
      const apiNoDefaultId: MockApiDefinition = {
        id: 'api-users-list',
        defaultScenarioId: null,
      };

      const result = resolveScenarioResult({
        api: apiNoDefaultId,
        scenarios: conflictingDefaults,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_CONFIGURATION');
      }
    });
  });

  describe('Cross-API and cross-project scope validation', () => {
    it('rejects scenario that belongs to a different apiDefinitionId', () => {
      const foreignScenario: MockScenario = {
        id: 'scenario-foreign',
        apiDefinitionId: 'other-api-id',
        projectId: 'project-alpha',
        name: 'Foreign Scenario',
        statusCode: 200,
      };

      const result = resolveScenarioResult({
        api: api1,
        scenarios: [foreignScenario],
        explicitScenarioId: 'scenario-foreign',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCENARIO_MISMATCH');
        expect(result.error.details?.expectedApiId).toBe(api1.id);
        expect(result.error.details?.actualApiId).toBe('other-api-id');
      }
    });

    it('rejects scenario that belongs to a different projectId', () => {
      const foreignProjectScenario: MockScenario = {
        id: 'scenario-foreign-project',
        apiDefinitionId: api1.id,
        projectId: 'project-other',
        name: 'Foreign Project Scenario',
        statusCode: 200,
      };

      const result = resolveScenarioResult({
        api: api1,
        scenarios: [foreignProjectScenario],
        explicitScenarioId: 'scenario-foreign-project',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SCENARIO_MISMATCH');
        expect(result.error.details?.expectedProjectId).toBe('project-alpha');
        expect(result.error.details?.actualProjectId).toBe('project-other');
      }
    });

    it('allows scenarios when apiDefinitionId and projectId match or are omitted', () => {
      const agnosticScenario: MockScenario = {
        id: 'scenario-agnostic',
        name: 'Agnostic Scenario',
        statusCode: 200,
        isDefault: true,
      };

      const result = resolveScenarioResult({
        api: { ...api1, defaultScenarioId: null },
        scenarios: [agnosticScenario],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.scenario.id).toBe('scenario-agnostic');
      }
    });
  });

  describe('Empty and missing scenarios', () => {
    it('fails with NO_SCENARIOS_AVAILABLE when scenarios array is empty', () => {
      const result = resolveScenarioResult({
        api: api1,
        scenarios: [],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_SCENARIOS_AVAILABLE');
      }
    });
  });

  describe('Direct resolver functions and typed errors', () => {
    it('resolveScenario returns the scenario directly on success', () => {
      const scenario = resolveScenario({
        api: api1,
        scenarios: standardScenarios,
      });

      expect(scenario.id).toBe(scenarioSuccess.id);
      expect(scenario.statusCode).toBe(200);
    });

    it('resolveScenario throws ScenarioResolutionError on failure', () => {
      expect(() =>
        resolveScenario({
          api: api1,
          scenarios: standardScenarios,
          explicitScenarioId: 'missing-id',
        }),
      ).toThrowError(ScenarioResolutionError);

      try {
        resolveScenario({
          api: api1,
          scenarios: standardScenarios,
          explicitScenarioId: 'missing-id',
        });
      } catch (error) {
        expect(error instanceof ScenarioResolutionError).toBe(true);
        const typed = error as ScenarioResolutionError;
        expect(typed.code).toBe('SCENARIO_NOT_FOUND');
      }
    });

    it('resolveScenarioWithReason returns both the scenario and resolution reason', () => {
      const outcome = resolveScenarioWithReason({
        api: api1,
        scenarios: standardScenarios,
        environmentScenarioId: scenarioCreated.id,
      });

      expect(outcome.scenario.id).toBe(scenarioCreated.id);
      expect(outcome.reason).toBe('environment');
    });

    it('resolveScenarioWithReason throws ScenarioResolutionError on failure', () => {
      expect(() =>
        resolveScenarioWithReason({
          api: api1,
          scenarios: [],
        }),
      ).toThrowError(ScenarioResolutionError);
    });
  });

  describe('Integration with Route Matcher', () => {
    interface FullRouteDefinition
      extends RouteDefinition, Omit<MockApiDefinition, 'method' | 'path'> {
      id: string;
      scenarios: MockScenario[];
    }

    it('resolves the scenario after matching a route with matchRoute', () => {
      const routes: FullRouteDefinition[] = [
        {
          id: 'api-users-create',
          method: 'POST',
          path: '/users',
          defaultScenarioId: 'users-post-201',
          scenarios: [
            {
              id: 'users-post-201',
              apiDefinitionId: 'api-users-create',
              name: 'Created',
              statusCode: 201,
              body: { created: true },
            },
          ],
        },
        {
          id: 'api-users-get',
          method: 'GET',
          path: '/users/:id',
          defaultScenarioId: 'users-get-200',
          scenarios: [
            {
              id: 'users-get-200',
              apiDefinitionId: 'api-users-get',
              name: 'User Details',
              statusCode: 200,
              body: { id: ':id', name: 'Sample' },
            },
            {
              id: 'users-get-404',
              apiDefinitionId: 'api-users-get',
              name: 'User Not Found',
              statusCode: 404,
              body: { error: 'Not found' },
            },
          ],
        },
      ];

      const match = matchRoute('GET', '/users/123', routes);
      expect(match).not.toBeNull();

      if (match) {
        expect(match.params).toEqual({ id: '123' });

        // Default scenario resolution
        const defaultResolution = resolveScenarioResult({
          api: match.route,
          scenarios: match.route.scenarios,
        });
        expect(defaultResolution.success).toBe(true);
        if (defaultResolution.success) {
          expect(defaultResolution.scenario.statusCode).toBe(200);
          expect(defaultResolution.reason).toBe('default');
        }

        // Explicit scenario resolution (e.g., caller requests 404)
        const notFoundResolution = resolveScenarioResult({
          api: match.route,
          scenarios: match.route.scenarios,
          explicitScenarioName: 'User Not Found',
        });
        expect(notFoundResolution.success).toBe(true);
        if (notFoundResolution.success) {
          expect(notFoundResolution.scenario.statusCode).toBe(404);
          expect(notFoundResolution.reason).toBe('explicit');
        }
      }
    });
  });
});
