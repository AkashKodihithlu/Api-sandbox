import { compileRoutes, type RouteDefinition, type RouteMatch } from './index.js';
import {
  resolveScenarioResult,
  type MockApiDefinition,
  type MockScenario,
  type ScenarioResolutionErrorCode,
  type ScenarioResolutionReason,
} from './scenario-resolver.js';
import {
  executeMockResponseResult,
  type ExecuteResponseOptions,
  type MockResponse,
  type ResponseExecutionErrorCode,
} from './response-executor.js';

/**
 * An API route configured for the unified MockEngine, combining route matching
 * metadata with API scenario configuration.
 */
export interface MockEngineRoute
  extends RouteDefinition, Omit<MockApiDefinition, 'method' | 'path'> {
  id: string;
  scenarios: MockScenario[];
}

/**
 * Incoming request representation for the unified MockEngine.
 */
export interface MockEngineRequest {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;

  /**
   * Explicit scenario selection override by ID.
   */
  explicitScenarioId?: string | null;

  /**
   * Explicit scenario selection override by name.
   */
  explicitScenarioName?: string | null;

  /**
   * Environment-mapped scenario ID.
   */
  environmentScenarioId?: string | null;

  /**
   * Active environment identifier.
   */
  environmentId?: string | null;
}

export type MockExecutionStatus =
  'MATCHED' | 'ROUTE_NOT_FOUND' | 'SCENARIO_RESOLUTION_FAILED' | 'RESPONSE_EXECUTION_FAILED';

export interface MockExecutionSuccess<
  TRoute extends MockEngineRoute = MockEngineRoute,
  TScenario extends MockScenario = MockScenario,
> {
  status: 'MATCHED';
  matched: true;
  route: TRoute;
  params: Record<string, string>;
  scenario: TScenario;
  resolutionReason: ScenarioResolutionReason;
  response: MockResponse;
}

export interface MockExecutionRouteNotFound {
  status: 'ROUTE_NOT_FOUND';
  matched: false;
  error: {
    code: 'ROUTE_NOT_FOUND';
    message: string;
    details?: {
      method: string;
      path: string;
    };
  };
}

export interface MockExecutionScenarioFailed<TRoute extends MockEngineRoute = MockEngineRoute> {
  status: 'SCENARIO_RESOLUTION_FAILED';
  matched: true;
  route: TRoute;
  params: Record<string, string>;
  error: {
    code: ScenarioResolutionErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface MockExecutionResponseFailed<
  TRoute extends MockEngineRoute = MockEngineRoute,
  TScenario extends MockScenario = MockScenario,
> {
  status: 'RESPONSE_EXECUTION_FAILED';
  matched: true;
  route: TRoute;
  params: Record<string, string>;
  scenario: TScenario;
  resolutionReason: ScenarioResolutionReason;
  error: {
    code: ResponseExecutionErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type MockExecutionResult<
  TRoute extends MockEngineRoute = MockEngineRoute,
  TScenario extends MockScenario = MockScenario,
> =
  | MockExecutionSuccess<TRoute, TScenario>
  | MockExecutionRouteNotFound
  | MockExecutionScenarioFailed<TRoute>
  | MockExecutionResponseFailed<TRoute, TScenario>;

export interface MockExecutionOptions extends ExecuteResponseOptions {
  /**
   * Environment scenario mapping dictionary or Map (apiDefinitionId -> scenarioId).
   */
  environmentScenarios?: Record<string, string> | Map<string, string> | null;

  /**
   * Active environment identifier.
   */
  environmentId?: string | null;

  /**
   * Whether to fallback to the first available scenario when no explicit,
   * environment, or default scenario is configured.
   */
  allowFallback?: boolean;
}

export interface MockEngineOptions<
  TRoute extends MockEngineRoute = MockEngineRoute,
> extends MockExecutionOptions {
  routes: TRoute[];
}

export class MockEngineError extends Error {
  readonly status: MockExecutionStatus;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: MockExecutionStatus,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MockEngineError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Unified Mock Execution Engine.
 *
 * Orchestrates the full request lifecycle:
 * 1. Matches incoming HTTP request to configured routes.
 * 2. Extracts path parameters.
 * 3. Resolves the appropriate response scenario (explicit, environment, default, fallback).
 * 4. Executes and validates the mock response (status code, headers, body, delay).
 * 5. Returns a structured execution result without throwing.
 */
export class MockEngine<
  TRoute extends MockEngineRoute = MockEngineRoute,
  TScenario extends MockScenario = MockScenario,
> {
  private readonly routes: TRoute[];
  private readonly matcher: (method: string, path: string) => RouteMatch<TRoute> | null;
  private readonly defaultOptions: MockExecutionOptions;

  constructor(options: MockEngineOptions<TRoute>) {
    this.routes = options.routes;
    this.matcher = compileRoutes(this.routes);
    this.defaultOptions = {
      environmentScenarios: options.environmentScenarios,
      environmentId: options.environmentId,
      allowFallback: options.allowFallback ?? false,
      maxBodyBytes: options.maxBodyBytes,
      maxDelayMs: options.maxDelayMs,
    };
  }

  /**
   * Executes a mock request through the full matching, resolution, and execution pipeline.
   * Returns a structured discriminated union result without throwing.
   */
  public execute(
    request: MockEngineRequest,
    options?: MockExecutionOptions,
  ): MockExecutionResult<TRoute, TScenario> {
    const method = request.method ?? '';
    const path = request.path ?? '';

    // Step 1: Route Matching
    let match: RouteMatch<TRoute> | null = null;
    try {
      match = this.matcher(method, path);
    } catch (matcherError) {
      const message = matcherError instanceof Error ? matcherError.message : 'Invalid route';
      return {
        status: 'ROUTE_NOT_FOUND',
        matched: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message,
          details: { method, path },
        },
      };
    }

    if (!match) {
      return {
        status: 'ROUTE_NOT_FOUND',
        matched: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `No route matching ${method.toUpperCase()} ${path}`,
          details: { method, path },
        },
      };
    }

    // Step 2: Determine scenario selection inputs (supporting request properties & headers)
    const normalizedHeaders: Record<string, string> = {};
    if (request.headers && typeof request.headers === 'object') {
      for (const [k, v] of Object.entries(request.headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
      }
    }

    const explicitScenarioId =
      request.explicitScenarioId ??
      normalizedHeaders['x-mockflow-scenario'] ??
      normalizedHeaders['x-mockflow-scenario-id'] ??
      null;

    const explicitScenarioName =
      request.explicitScenarioName ?? normalizedHeaders['x-mockflow-scenario-name'] ?? null;

    const environmentScenarioId =
      request.environmentScenarioId ?? normalizedHeaders['x-mockflow-environment-scenario'] ?? null;

    const environmentId =
      request.environmentId ??
      options?.environmentId ??
      this.defaultOptions.environmentId ??
      normalizedHeaders['x-mockflow-environment'] ??
      normalizedHeaders['x-mockflow-environment-id'] ??
      null;

    const environmentScenarios =
      options?.environmentScenarios ?? this.defaultOptions.environmentScenarios ?? null;

    const allowFallback = options?.allowFallback ?? this.defaultOptions.allowFallback ?? false;

    // Step 3: Scenario Resolution
    const scenarioResult = resolveScenarioResult<TScenario, TRoute>({
      api: match.route,
      scenarios: match.route.scenarios as TScenario[],
      explicitScenarioId,
      explicitScenarioName,
      environmentScenarioId,
      environmentScenarios,
      environmentId,
      allowFallback,
    });

    if (!scenarioResult.success) {
      return {
        status: 'SCENARIO_RESOLUTION_FAILED',
        matched: true,
        route: match.route,
        params: match.params,
        error: scenarioResult.error,
      };
    }

    // Step 4: Response Execution
    const maxBodyBytes = options?.maxBodyBytes ?? this.defaultOptions.maxBodyBytes;
    const maxDelayMs = options?.maxDelayMs ?? this.defaultOptions.maxDelayMs;

    const responseResult = executeMockResponseResult(scenarioResult.scenario, {
      requestContext: {
        method: match.route.method,
        path: request.path,
        params: match.params,
        query: request.query,
        headers: request.headers,
      },
      maxBodyBytes,
      maxDelayMs,
    });

    if (!responseResult.success) {
      return {
        status: 'RESPONSE_EXECUTION_FAILED',
        matched: true,
        route: match.route,
        params: match.params,
        scenario: scenarioResult.scenario,
        resolutionReason: scenarioResult.reason,
        error: responseResult.error,
      };
    }

    // Step 5: Successful Unified Result
    return {
      status: 'MATCHED',
      matched: true,
      route: match.route,
      params: match.params,
      scenario: scenarioResult.scenario,
      resolutionReason: scenarioResult.reason,
      response: responseResult.response,
    };
  }

  /**
   * Executes a mock request through the engine, returning MockExecutionSuccess on match,
   * or throwing MockEngineError if route not found, scenario resolution fails, or response fails.
   */
  public executeOrThrow(
    request: MockEngineRequest,
    options?: MockExecutionOptions,
  ): MockExecutionSuccess<TRoute, TScenario> {
    const result = this.execute(request, options);

    if (result.status !== 'MATCHED') {
      throw new MockEngineError(
        result.status,
        result.error.code,
        result.error.message,
        'details' in result.error ? result.error.details : undefined,
      );
    }

    return result;
  }

  /**
   * Executes a mock request and waits for any configured artificial delay asynchronously.
   * Supports an optional custom sleeper for deterministic testing.
   */
  public async executeWithDelay(
    request: MockEngineRequest,
    options?: MockExecutionOptions & {
      sleeper?: (ms: number) => Promise<void>;
    },
  ): Promise<MockExecutionResult<TRoute, TScenario>> {
    const result = this.execute(request, options);

    if (result.status === 'MATCHED' && result.response.delayMs > 0) {
      if (options?.sleeper) {
        await options.sleeper(result.response.delayMs);
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, result.response.delayMs));
      }
    }

    return result;
  }
}

/**
 * Creates and compiles a unified MockEngine instance.
 */
export function createMockEngine<
  TRoute extends MockEngineRoute = MockEngineRoute,
  TScenario extends MockScenario = MockScenario,
>(options: MockEngineOptions<TRoute>): MockEngine<TRoute, TScenario> {
  return new MockEngine<TRoute, TScenario>(options);
}

/**
 * Convenience function to execute a mock request against a set of routes in a single call.
 */
export function executeMockEngine<
  TRoute extends MockEngineRoute = MockEngineRoute,
  TScenario extends MockScenario = MockScenario,
>(
  routes: TRoute[],
  request: MockEngineRequest,
  options?: MockExecutionOptions,
): MockExecutionResult<TRoute, TScenario> {
  return createMockEngine<TRoute, TScenario>({
    ...options,
    routes,
  }).execute(request, options);
}
