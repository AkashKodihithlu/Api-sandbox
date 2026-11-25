import type { ScenarioType } from '@mockflow/contracts';

export type ScenarioResolutionReason =
  | 'explicit'
  | 'environment'
  | 'default'
  | 'fallback'
  | 'validation_error';

export type ScenarioResolutionErrorCode =
  | 'SCENARIO_NOT_FOUND'
  | 'SCENARIO_MISMATCH'
  | 'NO_DEFAULT_SCENARIO'
  | 'NO_SCENARIOS_AVAILABLE'
  | 'INVALID_CONFIGURATION';

export interface MockScenario {
  id: string;
  name: string;
  type?: ScenarioType;
  statusCode: number;
  apiDefinitionId?: string;
  projectId?: string;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
  isDefault?: boolean;
}

export interface MockApiDefinition {
  id?: string;
  projectId?: string;
  name?: string;
  method?: string;
  path?: string;
  requestSchema?: Record<string, unknown> | null;
  defaultScenarioId?: string | null;
  isPublished?: boolean;
}

export interface ScenarioResolutionOptions<
  TScenario extends MockScenario = MockScenario,
  TApi extends MockApiDefinition = MockApiDefinition,
> {
  /**
   * The matched API definition or route.
   */
  api: TApi;

  /**
   * The pool of available scenarios configured for the API.
   */
  scenarios: TScenario[];

  /**
   * Explicitly requested scenario ID (highest precedence).
   * E.g., passed via request header (x-mockflow-scenario) or query parameter.
   */
  explicitScenarioId?: string | null;

  /**
   * Explicitly requested scenario name (highest precedence).
   */
  explicitScenarioName?: string | null;

  /**
   * Direct scenario ID mapped for this API in the active environment.
   */
  environmentScenarioId?: string | null;

  /**
   * Environment scenario mapping dictionary or Map (apiDefinitionId -> scenarioId).
   */
  environmentScenarios?: Record<string, string> | Map<string, string> | null;

  /**
   * Active environment ID (for diagnostic and logging context).
   */
  environmentId?: string | null;

  /**
   * Whether to allow fallback to the first scenario if no explicit,
   * environment, or default scenario is configured.
   * Default: false.
   */
  allowFallback?: boolean;
}

export interface ScenarioResolutionSuccess<TScenario extends MockScenario = MockScenario> {
  success: true;
  scenario: TScenario;
  reason: ScenarioResolutionReason;
}

export interface ScenarioResolutionFailure {
  success: false;
  error: {
    code: ScenarioResolutionErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ScenarioResolutionResult<TScenario extends MockScenario = MockScenario> =
  | ScenarioResolutionSuccess<TScenario>
  | ScenarioResolutionFailure;

export class ScenarioResolutionError extends Error {
  readonly code: ScenarioResolutionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ScenarioResolutionErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ScenarioResolutionError';
    this.code = code;
    this.details = details;
  }
}

function validateScenarioOwnership<TScenario extends MockScenario, TApi extends MockApiDefinition>(
  scenario: TScenario,
  api: TApi,
): ScenarioResolutionFailure | null {
  if (api.id && scenario.apiDefinitionId && scenario.apiDefinitionId !== api.id) {
    return {
      success: false,
      error: {
        code: 'SCENARIO_MISMATCH',
        message: `Scenario "${scenario.id}" belongs to API "${scenario.apiDefinitionId}", not the matched API "${api.id}".`,
        details: {
          scenarioId: scenario.id,
          expectedApiId: api.id,
          actualApiId: scenario.apiDefinitionId,
        },
      },
    };
  }

  if (api.projectId && scenario.projectId && scenario.projectId !== api.projectId) {
    return {
      success: false,
      error: {
        code: 'SCENARIO_MISMATCH',
        message: `Scenario "${scenario.id}" belongs to project "${scenario.projectId}", not the matched project "${api.projectId}".`,
        details: {
          scenarioId: scenario.id,
          expectedProjectId: api.projectId,
          actualProjectId: scenario.projectId,
        },
      },
    };
  }

  return null;
}

/**
 * Deterministically selects a VALIDATION_ERROR scenario for an API when request
 * validation fails. Ignores ordinary environment/default overrides so that invalid
 * requests consistently trigger validation-error behavior.
 */
export function resolveValidationErrorScenario<
  TScenario extends MockScenario = MockScenario,
  TApi extends MockApiDefinition = MockApiDefinition,
>(api: TApi, scenarios: TScenario[]): ScenarioResolutionResult<TScenario> {
  if (!scenarios || scenarios.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_SCENARIOS_AVAILABLE',
        message: `No scenarios configured for API "${api.id ?? api.path ?? 'unknown'}".`,
        details: { apiId: api.id },
      },
    };
  }

  const candidates = scenarios.filter((s) => s.type === 'VALIDATION_ERROR');
  if (candidates.length === 0) {
    return {
      success: false,
      error: {
        code: 'SCENARIO_NOT_FOUND',
        message: `No VALIDATION_ERROR scenario configured for API "${api.id ?? api.path ?? 'unknown'}".`,
        details: { apiId: api.id, requiredType: 'VALIDATION_ERROR' },
      },
    };
  }

  // Deterministic tie-breaking: prefer default scenario if it is a VALIDATION_ERROR,
  // otherwise sort deterministically by id.
  const sorted = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  const selected =
    candidates.find((s) => s.id === api.defaultScenarioId) ??
    candidates.find((s) => s.isDefault === true) ??
    sorted[0];

  const ownershipError = validateScenarioOwnership(selected, api);
  if (ownershipError) {
    return ownershipError;
  }

  return {
    success: true,
    scenario: selected,
    reason: 'validation_error',
  };
}

/**
 * Resolves which response scenario should be used for a matched API definition.
 *
 * Precedence hierarchy:
 * 1. Explicit scenario selection (by explicitScenarioId or explicitScenarioName)
 * 2. Environment-based scenario mapping (by environmentScenarioId or environmentScenarios mapping)
 * 3. API default scenario (by api.defaultScenarioId or scenario with isDefault: true)
 * 4. Fallback to first available scenario (only if allowFallback: true)
 *
 * Returns a typed discriminated union without throwing.
 */
export function resolveScenarioResult<
  TScenario extends MockScenario = MockScenario,
  TApi extends MockApiDefinition = MockApiDefinition,
>(options: ScenarioResolutionOptions<TScenario, TApi>): ScenarioResolutionResult<TScenario> {
  const {
    api,
    scenarios,
    explicitScenarioId,
    explicitScenarioName,
    environmentScenarioId,
    environmentScenarios,
    environmentId,
    allowFallback = false,
  } = options;

  if (!scenarios || scenarios.length === 0) {
    return {
      success: false,
      error: {
        code: 'NO_SCENARIOS_AVAILABLE',
        message: `No scenarios configured for API "${api.id ?? api.path ?? 'unknown'}".`,
        details: { apiId: api.id },
      },
    };
  }

  // 1. Explicit Selection
  const hasExplicitId =
    typeof explicitScenarioId === 'string' && explicitScenarioId.trim().length > 0;
  const hasExplicitName =
    typeof explicitScenarioName === 'string' && explicitScenarioName.trim().length > 0;

  if (hasExplicitId || hasExplicitName) {
    let selectedById: TScenario | undefined;
    let selectedByName: TScenario | undefined;

    if (hasExplicitId) {
      selectedById = scenarios.find((s) => s.id === explicitScenarioId);
      if (!selectedById) {
        return {
          success: false,
          error: {
            code: 'SCENARIO_NOT_FOUND',
            message: `Explicit scenario with id "${explicitScenarioId}" not found for API "${api.id ?? 'unknown'}".`,
            details: { explicitScenarioId },
          },
        };
      }
    }

    if (hasExplicitName) {
      const matchingNames = scenarios.filter((s) => s.name === explicitScenarioName);
      if (matchingNames.length === 0) {
        return {
          success: false,
          error: {
            code: 'SCENARIO_NOT_FOUND',
            message: `Explicit scenario with name "${explicitScenarioName}" not found for API "${api.id ?? 'unknown'}".`,
            details: { explicitScenarioName },
          },
        };
      }
      if (matchingNames.length > 1) {
        return {
          success: false,
          error: {
            code: 'INVALID_CONFIGURATION',
            message: `Ambiguous scenario name "${explicitScenarioName}": multiple scenarios share this name.`,
            details: { explicitScenarioName },
          },
        };
      }
      selectedByName = matchingNames[0];
    }

    if (selectedById && selectedByName && selectedById.id !== selectedByName.id) {
      return {
        success: false,
        error: {
          code: 'INVALID_CONFIGURATION',
          message: `Conflicting explicit scenario selections: id "${explicitScenarioId}" does not match name "${explicitScenarioName}".`,
          details: {
            explicitScenarioId,
            explicitScenarioName,
            idScenario: selectedById.id,
            nameScenario: selectedByName.id,
          },
        },
      };
    }

    const selected = selectedById ?? selectedByName!;
    const ownershipError = validateScenarioOwnership(selected, api);
    if (ownershipError) {
      return ownershipError;
    }

    return {
      success: true,
      scenario: selected,
      reason: 'explicit',
    };
  }

  // 2. Environment-based Selection
  let targetEnvScenarioId: string | null = null;
  if (typeof environmentScenarioId === 'string' && environmentScenarioId.trim().length > 0) {
    targetEnvScenarioId = environmentScenarioId;
  } else if (environmentScenarios && api.id) {
    if (environmentScenarios instanceof Map) {
      targetEnvScenarioId = environmentScenarios.get(api.id) ?? null;
    } else if (Object.prototype.hasOwnProperty.call(environmentScenarios, api.id)) {
      targetEnvScenarioId = environmentScenarios[api.id] ?? null;
    }
  }

  if (targetEnvScenarioId) {
    const scenario = scenarios.find((s) => s.id === targetEnvScenarioId);
    if (!scenario) {
      return {
        success: false,
        error: {
          code: 'SCENARIO_NOT_FOUND',
          message: `Environment-mapped scenario "${targetEnvScenarioId}" not found for API "${api.id ?? 'unknown'}".`,
          details: {
            environmentId: environmentId ?? undefined,
            environmentScenarioId: targetEnvScenarioId,
          },
        },
      };
    }

    const ownershipError = validateScenarioOwnership(scenario, api);
    if (ownershipError) {
      return ownershipError;
    }

    return {
      success: true,
      scenario,
      reason: 'environment',
    };
  }

  // 3. API Default Selection
  if (api.defaultScenarioId) {
    const scenario = scenarios.find((s) => s.id === api.defaultScenarioId);
    if (!scenario) {
      return {
        success: false,
        error: {
          code: 'SCENARIO_NOT_FOUND',
          message: `Configured default scenario "${api.defaultScenarioId}" on API definition "${api.id ?? 'unknown'}" not found in available scenarios.`,
          details: { defaultScenarioId: api.defaultScenarioId },
        },
      };
    }

    const ownershipError = validateScenarioOwnership(scenario, api);
    if (ownershipError) {
      return ownershipError;
    }

    return {
      success: true,
      scenario,
      reason: 'default',
    };
  }

  const defaultScenarios = scenarios.filter((s) => s.isDefault === true);
  if (defaultScenarios.length > 1) {
    return {
      success: false,
      error: {
        code: 'INVALID_CONFIGURATION',
        message: `Multiple default scenarios marked for API "${api.id ?? 'unknown'}".`,
        details: { scenarioIds: defaultScenarios.map((s) => s.id) },
      },
    };
  }

  if (defaultScenarios.length === 1) {
    const scenario = defaultScenarios[0];
    const ownershipError = validateScenarioOwnership(scenario, api);
    if (ownershipError) {
      return ownershipError;
    }

    return {
      success: true,
      scenario,
      reason: 'default',
    };
  }

  // 4. Fallback Selection
  if (allowFallback) {
    const scenario = scenarios[0];
    const ownershipError = validateScenarioOwnership(scenario, api);
    if (ownershipError) {
      return ownershipError;
    }

    return {
      success: true,
      scenario,
      reason: 'fallback',
    };
  }

  return {
    success: false,
    error: {
      code: 'NO_DEFAULT_SCENARIO',
      message: `No default scenario configured for API "${api.id ?? api.path ?? 'unknown'}" and no explicit or environment selection was provided.`,
      details: { apiId: api.id },
    },
  };
}

/**
 * Resolves which scenario should be used for a matched API, returning the scenario directly.
 * Throws ScenarioResolutionError if resolution fails.
 */
export function resolveScenario<
  TScenario extends MockScenario = MockScenario,
  TApi extends MockApiDefinition = MockApiDefinition,
>(options: ScenarioResolutionOptions<TScenario, TApi>): TScenario {
  const result = resolveScenarioResult(options);

  if (!result.success) {
    throw new ScenarioResolutionError(
      result.error.code,
      result.error.message,
      result.error.details,
    );
  }

  return result.scenario;
}

/**
 * Resolves which scenario should be used for a matched API, returning both the scenario
 * and the resolution reason. Throws ScenarioResolutionError if resolution fails.
 */
export function resolveScenarioWithReason<
  TScenario extends MockScenario = MockScenario,
  TApi extends MockApiDefinition = MockApiDefinition,
>(
  options: ScenarioResolutionOptions<TScenario, TApi>,
): {
  scenario: TScenario;
  reason: ScenarioResolutionReason;
} {
  const result = resolveScenarioResult(options);

  if (!result.success) {
    throw new ScenarioResolutionError(
      result.error.code,
      result.error.message,
      result.error.details,
    );
  }

  return {
    scenario: result.scenario,
    reason: result.reason,
  };
}
