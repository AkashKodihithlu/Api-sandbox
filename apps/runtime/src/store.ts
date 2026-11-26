import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ScenarioType } from '@mockflow/contracts';
import {
  apiDefinitions,
  environmentScenarios,
  environments,
  projects,
  requestLogs,
  responseScenarios,
  type Database,
} from '@mockflow/db';
import type { HttpMethod, MockEngineRoute, MockScenario } from '@mockflow/mock-engine';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActiveProject {
  id: string;
  slug: string;
  name: string;
}

export interface ResolvedEnvironment {
  id: string;
  name: string;
  scenarios: Record<string, string>;
}

export interface RequestLogEntry {
  projectId: string;
  apiDefinitionId: string | null;
  scenarioId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  redactedHeaders: Record<string, string>;
}

export interface RuntimeStore {
  findActiveProjectBySlug(slug: string): Promise<ActiveProject | null>;
  loadPublishedRoutesForProject(projectId: string): Promise<MockEngineRoute[]>;
  resolveEnvironment(
    projectId: string,
    environmentKey: string,
  ): Promise<ResolvedEnvironment | null>;
  recordRequestLog(entry: RequestLogEntry): Promise<void>;
}

function normalizeHeadersRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue === 'string') {
      normalized[key] = headerValue;
    }
  }
  return normalized;
}

export class DrizzleRuntimeStore implements RuntimeStore {
  constructor(private readonly db: Database) {}

  async findActiveProjectBySlug(slug: string): Promise<ActiveProject | null> {
    const trimmed = slug.trim();
    if (!trimmed || trimmed.length > 80) {
      return null;
    }

    const [project] = await this.db
      .select({
        id: projects.id,
        slug: projects.slug,
        name: projects.name,
      })
      .from(projects)
      .where(and(eq(projects.slug, trimmed), eq(projects.status, 'ACTIVE')))
      .limit(1);

    return project ?? null;
  }

  async loadPublishedRoutesForProject(projectId: string): Promise<MockEngineRoute[]> {
    const apis = await this.db
      .select({
        id: apiDefinitions.id,
        projectId: apiDefinitions.projectId,
        name: apiDefinitions.name,
        method: apiDefinitions.method,
        path: apiDefinitions.path,
        requestSchema: apiDefinitions.requestSchema,
        defaultScenarioId: apiDefinitions.defaultScenarioId,
        isPublished: apiDefinitions.isPublished,
      })
      .from(apiDefinitions)
      .where(and(eq(apiDefinitions.projectId, projectId), eq(apiDefinitions.isPublished, true)))
      .orderBy(asc(apiDefinitions.path), asc(apiDefinitions.method));

    if (apis.length === 0) {
      return [];
    }

    const apiIds = apis.map((api) => api.id);
    const scenarios = await this.db
      .select({
        id: responseScenarios.id,
        apiDefinitionId: responseScenarios.apiDefinitionId,
        name: responseScenarios.name,
        type: responseScenarios.type,
        statusCode: responseScenarios.statusCode,
        headers: responseScenarios.headers,
        body: responseScenarios.body,
        delayMs: responseScenarios.delayMs,
        isDefault: responseScenarios.isDefault,
      })
      .from(responseScenarios)
      .where(inArray(responseScenarios.apiDefinitionId, apiIds))
      .orderBy(asc(responseScenarios.name));

    const scenariosByApiId = new Map<string, MockScenario[]>();
    for (const row of scenarios) {
      const list = scenariosByApiId.get(row.apiDefinitionId) ?? [];
      list.push({
        id: row.id,
        apiDefinitionId: row.apiDefinitionId,
        projectId,
        name: row.name,
        type: row.type as ScenarioType,
        statusCode: row.statusCode,
        headers: normalizeHeadersRecord(row.headers),
        body: row.body,
        delayMs: row.delayMs,
        isDefault: row.isDefault,
      });
      scenariosByApiId.set(row.apiDefinitionId, list);
    }

    return apis.map((api) => ({
      id: api.id,
      projectId: api.projectId,
      name: api.name,
      method: api.method as HttpMethod,
      path: api.path,
      requestSchema:
        api.requestSchema &&
        typeof api.requestSchema === 'object' &&
        !Array.isArray(api.requestSchema)
          ? (api.requestSchema as Record<string, unknown>)
          : null,
      defaultScenarioId: api.defaultScenarioId,
      isPublished: api.isPublished,
      scenarios: scenariosByApiId.get(api.id) ?? [],
    }));
  }

  async resolveEnvironment(
    projectId: string,
    environmentKey: string,
  ): Promise<ResolvedEnvironment | null> {
    const trimmed = environmentKey.trim();
    if (!trimmed || trimmed.length > 120) {
      return null;
    }

    const predicate = UUID_REGEX.test(trimmed)
      ? and(eq(environments.projectId, projectId), eq(environments.id, trimmed))
      : and(eq(environments.projectId, projectId), eq(environments.name, trimmed));

    const [environment] = await this.db
      .select({
        id: environments.id,
        name: environments.name,
      })
      .from(environments)
      .where(predicate)
      .limit(1);

    if (!environment) {
      return null;
    }

    const mappings = await this.db
      .select({
        apiDefinitionId: environmentScenarios.apiDefinitionId,
        scenarioId: environmentScenarios.scenarioId,
      })
      .from(environmentScenarios)
      .where(eq(environmentScenarios.environmentId, environment.id));

    const scenarioMap: Record<string, string> = {};
    for (const mapping of mappings) {
      scenarioMap[mapping.apiDefinitionId] = mapping.scenarioId;
    }

    return {
      id: environment.id,
      name: environment.name,
      scenarios: scenarioMap,
    };
  }

  async recordRequestLog(entry: RequestLogEntry): Promise<void> {
    await this.db.insert(requestLogs).values({
      projectId: entry.projectId,
      apiDefinitionId: entry.apiDefinitionId,
      scenarioId: entry.scenarioId,
      method: entry.method.slice(0, 16),
      path: entry.path.slice(0, 500),
      statusCode: entry.statusCode,
      durationMs: Math.max(0, Math.round(entry.durationMs)),
      requestBytes: Math.max(0, Math.round(entry.requestBytes)),
      responseBytes: Math.max(0, Math.round(entry.responseBytes)),
      redactedHeaders: entry.redactedHeaders,
    });
  }
}

export function createRuntimeStore(db: Database): RuntimeStore {
  return new DrizzleRuntimeStore(db);
}
