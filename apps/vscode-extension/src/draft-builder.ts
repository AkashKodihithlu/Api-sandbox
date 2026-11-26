import type { DiscoveryGroup } from '@mockflow/api-discovery';
import {
  normalizedRoutePath,
  validateRequestSchemaDefinition,
  validateScenarioConfiguration,
  type ScenarioValidationIssue,
} from '@mockflow/contracts';
import type { ApiDefinitionDraft, ApiDefinitionSummary, ScenarioDraft } from './client.js';

export const SUPPORTED_API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type SupportedApiMethod = (typeof SUPPORTED_API_METHODS)[number];

export interface InferredSuggestion<T> {
  value: T;
  inferred: true;
  suggestionLabel: string;
}

export interface GeneratedApiDraft {
  name: string;
  method: SupportedApiMethod | null;
  path: string | null;
  description: string;
  certainty: DiscoveryGroup['certainty'];
  warnings: string[];
  requestSchemaSuggestion?: InferredSuggestion<Record<string, unknown>>;
  suggestedScenario: ScenarioDraft & {
    inferred: true;
    suggestionLabel: string;
  };
}

export function isSupportedApiMethod(method: string): method is SupportedApiMethod {
  return SUPPORTED_API_METHODS.includes(method.toUpperCase() as SupportedApiMethod);
}

export function createDraftFromDiscovery(group: DiscoveryGroup): GeneratedApiDraft {
  const upperMethod = group.method.toUpperCase();
  const method = isSupportedApiMethod(upperMethod) ? upperMethod : null;
  const warnings = [...group.warnings];
  if (!method) {
    warnings.push(
      `HTTP method "${group.method}" is not supported by MockFlow endpoints; select GET, POST, PUT, PATCH, or DELETE.`,
    );
  }

  const normalizedPath =
    group.certainty === 'static' && group.path && group.path.startsWith('/')
      ? normalizedRoutePath(group.path)
      : null;

  const firstSource = group.discoveries[0]?.source;
  const sourceNote = firstSource
    ? `Discovered at ${firstSource.file}:${firstSource.line} (suggestion only; verify contract before publishing).`
    : 'Created from local API discovery (suggestion only; verify contract before publishing).';

  const hasJsonBodyHint = group.discoveries.some((item) => item.bodyHint === 'JSON body');
  const effectiveMethod = method ?? 'GET';

  const statusCode = effectiveMethod === 'POST' ? 201 : effectiveMethod === 'DELETE' ? 204 : 200;
  const suggestedBody =
    statusCode === 204
      ? null
      : effectiveMethod === 'POST'
        ? { status: 'created', inferred: true }
        : { ok: true, inferred: true };

  const requestSchemaSuggestion: InferredSuggestion<Record<string, unknown>> | undefined =
    hasJsonBodyHint &&
    (effectiveMethod === 'POST' || effectiveMethod === 'PUT' || effectiveMethod === 'PATCH')
      ? {
          value: {
            type: 'object',
            additionalProperties: true,
          },
          inferred: true,
          suggestionLabel: 'Suggested (inferred from JSON.stringify request body)',
        }
      : undefined;

  return {
    name: `${effectiveMethod} ${normalizedPath ?? 'endpoint'}`,
    method,
    path: normalizedPath,
    description: sourceNote,
    certainty: group.certainty,
    warnings,
    requestSchemaSuggestion,
    suggestedScenario: {
      name: 'Default Success (Suggested)',
      type: 'SUCCESS',
      statusCode,
      headers: {},
      body: suggestedBody,
      delayMs: 0,
      isDefault: true,
      inferred: true,
      suggestionLabel: `Suggested (inferred from ${effectiveMethod} method; edit before publishing)`,
    },
  };
}

export function detectApiConflict(
  candidate: { method: string; path: string },
  existingApis: readonly ApiDefinitionSummary[],
  excludeApiId?: string,
): ApiDefinitionSummary | undefined {
  const targetMethod = candidate.method.trim().toUpperCase();
  const targetPath = normalizedRoutePath(candidate.path.trim());

  return existingApis.find(
    (api) =>
      api.id !== excludeApiId &&
      api.method.toUpperCase() === targetMethod &&
      normalizedRoutePath(api.path) === targetPath,
  );
}

export function buildApiDefinitionDraft(input: {
  name: string;
  method: string;
  path: string;
  description?: string;
  requestSchema?: Record<string, unknown> | null;
}): { ok: true; draft: ApiDefinitionDraft } | { ok: false; message: string } {
  const method = input.method.trim().toUpperCase();
  if (!isSupportedApiMethod(method)) {
    return {
      ok: false,
      message: 'Method must be one of GET, POST, PUT, PATCH, or DELETE.',
    };
  }

  const trimmedPath = input.path.trim();
  if (!trimmedPath.startsWith('/')) {
    return {
      ok: false,
      message: 'API path must start with "/".',
    };
  }

  const normalizedPath = normalizedRoutePath(trimmedPath);
  if (normalizedPath.length > 500) {
    return {
      ok: false,
      message: 'API path must be 500 characters or fewer.',
    };
  }

  if (input.requestSchema !== undefined && input.requestSchema !== null) {
    const schemaIssues = validateRequestSchemaDefinition(input.requestSchema);
    if (schemaIssues.length > 0) {
      return {
        ok: false,
        message: schemaIssues[0]?.message ?? 'Request schema is invalid.',
      };
    }
  }

  const name = input.name.trim() || `${method} ${normalizedPath}`;

  return {
    ok: true,
    draft: {
      name: name.slice(0, 120),
      method,
      path: normalizedPath,
      ...(input.description?.trim() ? { description: input.description.trim().slice(0, 500) } : {}),
      ...(input.requestSchema !== undefined ? { requestSchema: input.requestSchema } : {}),
    },
  };
}

export function parseAndValidateScenarioInput(input: {
  name: string;
  statusCode: number;
  headersJson?: string;
  bodyJson?: string;
  delayMs?: number;
  isDefault?: boolean;
}):
  | { ok: true; scenario: ScenarioDraft }
  | { ok: false; message: string; issues?: ScenarioValidationIssue[] } {
  let headers: Record<string, string> = {};
  if (input.headersJson && input.headersJson.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.headersJson);
    } catch {
      return { ok: false, message: 'Headers must be valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, message: 'Headers must be a JSON object of string values.' };
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'string') {
        return { ok: false, message: `Header "${k}" value must be a string.` };
      }
      headers[k] = v;
    }
  }

  let body: unknown = null;
  if (input.bodyJson !== undefined && input.bodyJson.trim().length > 0) {
    try {
      body = JSON.parse(input.bodyJson);
    } catch {
      return { ok: false, message: 'Response body must be valid JSON.' };
    }
  }

  const delayMs = input.delayMs ?? 0;
  const issues = validateScenarioConfiguration({
    statusCode: input.statusCode,
    headers,
    body,
    delayMs,
  });

  if (issues.length > 0) {
    return {
      ok: false,
      message: issues[0]?.message ?? 'Scenario configuration is invalid.',
      issues,
    };
  }

  return {
    ok: true,
    scenario: {
      name: input.name.trim().slice(0, 120) || 'Default',
      type: 'SUCCESS',
      statusCode: input.statusCode,
      headers,
      body,
      delayMs,
      isDefault: input.isDefault ?? true,
    },
  };
}
