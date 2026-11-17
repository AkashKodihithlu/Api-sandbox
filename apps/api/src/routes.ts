import { and, asc, count, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  apiDefinitionCreateSchema,
  apiDefinitionUpdateSchema,
  environmentCreateSchema,
  environmentUpdateSchema,
  normalizedRoutePath,
  paginationQuerySchema,
  projectCreateSchema,
  projectUpdateSchema,
  scenarioCreateSchema,
  scenarioUpdateSchema,
} from '@mockflow/contracts';
import { requireUser, hashPassword, verifyPassword } from './auth.js';
import type { Database } from './db/client.js';
import { apiDefinitions, environments, environmentScenarios, projectMembers, projects, responseScenarios, users } from './db/schema.js';

type RouteOptions = { db: Database };
type ProjectRole = 'OWNER' | 'EDITOR' | 'VIEWER';
const registrationSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(120).optional(),
});
const credentialsSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
});
const scenarioSelectionSchema = z.object({ scenarioId: z.string().uuid() });

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string, details: unknown[] = []) {
  return reply.code(statusCode).send({ error: { code, message, details } });
}

function parse<T>(schema: { safeParse(input: unknown): { success: boolean; data?: T; error?: { issues: unknown[] } } }, input: unknown, reply: FastifyReply): T | undefined {
  const result = schema.safeParse(input);
  if (!result.success) {
    sendError(reply, 400, 'VALIDATION_ERROR', 'The supplied input is invalid', result.error?.issues ?? []);
    return undefined;
  }
  return result.data;
}

async function authorizeProject(db: Database, request: FastifyRequest, reply: FastifyReply, projectId: string, minimumRole: ProjectRole = 'VIEWER') {
  const user = await requireUser(request).catch(() => undefined);
  if (!user) return sendError(reply, 401, 'AUTH_REQUIRED', 'Authentication is required');
  const [membership] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id))).limit(1);
  const rank: Record<ProjectRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };
  if (!membership || rank[membership.role] < rank[minimumRole]) return sendError(reply, 403, 'ACCESS_DENIED', 'You do not have access to this project');
  return { user, membership };
}

async function apiWithProject(db: Database, apiId: string) {
  const [api] = await db.select().from(apiDefinitions).where(eq(apiDefinitions.id, apiId)).limit(1);
  return api;
}

export async function registerControlPlaneRoutes(app: FastifyInstance, { db }: RouteOptions) {
  app.post('/v1/auth/register', async (request, reply) => {
    const input = parse(registrationSchema, request.body, reply);
    if (!input) return;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) return sendError(reply, 409, 'EMAIL_ALREADY_REGISTERED', 'An account already exists for this email');
    const [user] = await db.insert(users).values({ email: input.email, displayName: input.displayName, passwordHash: await hashPassword(input.password) }).returning({ id: users.id, email: users.email, displayName: users.displayName });
    return reply.code(201).send({ data: { user, token: app.jwt.sign({ id: user.id, email: user.email }) } });
  });

  app.post('/v1/auth/session', async (request, reply) => {
    const credentials = parse(credentialsSchema, request.body, reply);
    if (!credentials) return;
    const [user] = await db.select().from(users).where(eq(users.email, credentials.email)).limit(1);
    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    return { data: { user: { id: user.id, email: user.email, displayName: user.displayName }, token: app.jwt.sign({ id: user.id, email: user.email }) } };
  });

  app.get('/v1/auth/me', async (request, reply) => {
    const user = await requireUser(request).catch(() => undefined);
    if (!user) return sendError(reply, 401, 'AUTH_REQUIRED', 'Authentication is required');
    return { data: user };
  });

  app.post('/v1/projects', async (request, reply) => {
    const user = await requireUser(request).catch(() => undefined);
    if (!user) return sendError(reply, 401, 'AUTH_REQUIRED', 'Authentication is required');
    const input = parse(projectCreateSchema, request.body, reply); if (!input) return;
    const [project] = await db.insert(projects).values({ ...input, ownerId: user.id }).returning();
    await db.insert(projectMembers).values({ projectId: project.id, userId: user.id, role: 'OWNER' });
    return reply.code(201).send({ data: project });
  });

  app.get('/v1/projects', async (request, reply) => {
    const user = await requireUser(request).catch(() => undefined); if (!user) return sendError(reply, 401, 'AUTH_REQUIRED', 'Authentication is required');
    const query = parse(paginationQuerySchema, request.query, reply); if (!query) return;
    const offset = (query.page - 1) * query.pageSize;
    const data = await db.select({ id: projects.id, name: projects.name, slug: projects.slug, description: projects.description, status: projects.status, createdAt: projects.createdAt, updatedAt: projects.updatedAt, role: projectMembers.role }).from(projectMembers).innerJoin(projects, eq(projectMembers.projectId, projects.id)).where(eq(projectMembers.userId, user.id)).orderBy(asc(projects.name)).limit(query.pageSize).offset(offset);
    const [totalRow] = await db.select({ total: count() }).from(projectMembers).where(eq(projectMembers.userId, user.id));
    return { data, pagination: { ...query, total: totalRow?.total ?? 0 } };
  });

  app.get('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }; const authorization = await authorizeProject(db, request, reply, projectId); if (!authorization || 'statusCode' in authorization) return;
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return project ? { data: project } : sendError(reply, 404, 'PROJECT_NOT_FOUND', 'Project does not exist or is unavailable');
  });

  app.patch('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }; const authorization = await authorizeProject(db, request, reply, projectId, 'OWNER'); if (!authorization || 'statusCode' in authorization) return;
    const input = parse(projectUpdateSchema, request.body, reply); if (!input || Object.keys(input).length === 0) return input ? sendError(reply, 400, 'VALIDATION_ERROR', 'Supply at least one field') : undefined;
    const [project] = await db.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
    return project ? { data: project } : sendError(reply, 404, 'PROJECT_NOT_FOUND', 'Project does not exist or is unavailable');
  });

  app.delete('/v1/projects/:projectId', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }; const authorization = await authorizeProject(db, request, reply, projectId, 'OWNER'); if (!authorization || 'statusCode' in authorization) return;
    const deleted = await db.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id });
    return deleted.length ? reply.code(204).send() : sendError(reply, 404, 'PROJECT_NOT_FOUND', 'Project does not exist or is unavailable');
  });

  app.post('/v1/projects/:projectId/apis', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }; const authorization = await authorizeProject(db, request, reply, projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    const input = parse(apiDefinitionCreateSchema, request.body, reply); if (!input) return;
    const [api] = await db.insert(apiDefinitions).values({ ...input, path: normalizedRoutePath(input.path), projectId }).returning();
    return reply.code(201).send({ data: api });
  });

  app.get('/v1/projects/:projectId/apis', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }; const authorization = await authorizeProject(db, request, reply, projectId); if (!authorization || 'statusCode' in authorization) return;
    const query = parse(paginationQuerySchema, request.query, reply); if (!query) return;
    const data = await db.select().from(apiDefinitions).where(eq(apiDefinitions.projectId, projectId)).orderBy(asc(apiDefinitions.path)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const [totalRow] = await db.select({ total: count() }).from(apiDefinitions).where(eq(apiDefinitions.projectId, projectId));
    return { data, pagination: { ...query, total: totalRow?.total ?? 0 } };
  });

  app.get('/v1/apis/:apiId', async (request, reply) => {
    const api = await apiWithProject(db, (request.params as { apiId: string }).apiId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist');
    const authorization = await authorizeProject(db, request, reply, api.projectId); if (!authorization || 'statusCode' in authorization) return;
    return { data: api };
  });

  app.patch('/v1/apis/:apiId', async (request, reply) => {
    const apiId = (request.params as { apiId: string }).apiId; const api = await apiWithProject(db, apiId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist');
    const authorization = await authorizeProject(db, request, reply, api.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    const input = parse(apiDefinitionUpdateSchema, request.body, reply); if (!input || Object.keys(input).length === 0) return input ? sendError(reply, 400, 'VALIDATION_ERROR', 'Supply at least one field') : undefined;
    const [updated] = await db.update(apiDefinitions).set({ ...input, path: input.path ? normalizedRoutePath(input.path) : undefined, updatedAt: new Date() }).where(eq(apiDefinitions.id, apiId)).returning();
    return { data: updated };
  });

  app.delete('/v1/apis/:apiId', async (request, reply) => {
    const apiId = (request.params as { apiId: string }).apiId; const api = await apiWithProject(db, apiId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist');
    const authorization = await authorizeProject(db, request, reply, api.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    await db.delete(apiDefinitions).where(eq(apiDefinitions.id, apiId)); return reply.code(204).send();
  });

  app.post('/v1/apis/:apiId/scenarios', async (request, reply) => {
    const apiId = (request.params as { apiId: string }).apiId; const api = await apiWithProject(db, apiId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist');
    const authorization = await authorizeProject(db, request, reply, api.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    const input = parse(scenarioCreateSchema, request.body, reply); if (!input) return;
    if (input.isDefault) await db.update(responseScenarios).set({ isDefault: false }).where(eq(responseScenarios.apiDefinitionId, apiId));
    const [scenario] = await db.insert(responseScenarios).values({ ...input, apiDefinitionId: apiId }).returning();
    if (input.isDefault) await db.update(apiDefinitions).set({ defaultScenarioId: scenario.id, updatedAt: new Date() }).where(eq(apiDefinitions.id, apiId));
    return reply.code(201).send({ data: scenario });
  });

  app.get('/v1/apis/:apiId/scenarios', async (request, reply) => {
    const apiId = (request.params as { apiId: string }).apiId; const api = await apiWithProject(db, apiId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist');
    const authorization = await authorizeProject(db, request, reply, api.projectId); if (!authorization || 'statusCode' in authorization) return;
    return { data: await db.select().from(responseScenarios).where(eq(responseScenarios.apiDefinitionId, apiId)).orderBy(asc(responseScenarios.name)) };
  });

  app.patch('/v1/scenarios/:scenarioId', async (request, reply) => {
    const scenarioId = (request.params as { scenarioId: string }).scenarioId; const [scenario] = await db.select().from(responseScenarios).where(eq(responseScenarios.id, scenarioId)).limit(1); if (!scenario) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'Scenario does not exist');
    const api = await apiWithProject(db, scenario.apiDefinitionId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist'); const authorization = await authorizeProject(db, request, reply, api.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    const input = parse(scenarioUpdateSchema, request.body, reply); if (!input || Object.keys(input).length === 0) return input ? sendError(reply, 400, 'VALIDATION_ERROR', 'Supply at least one field') : undefined;
    if (input.isDefault) await db.update(responseScenarios).set({ isDefault: false }).where(eq(responseScenarios.apiDefinitionId, api.id));
    const [updated] = await db.update(responseScenarios).set({ ...input, updatedAt: new Date() }).where(eq(responseScenarios.id, scenarioId)).returning();
    if (input.isDefault) await db.update(apiDefinitions).set({ defaultScenarioId: updated.id, updatedAt: new Date() }).where(eq(apiDefinitions.id, api.id));
    return { data: updated };
  });

  app.delete('/v1/scenarios/:scenarioId', async (request, reply) => {
    const scenarioId = (request.params as { scenarioId: string }).scenarioId; const [scenario] = await db.select().from(responseScenarios).where(eq(responseScenarios.id, scenarioId)).limit(1); if (!scenario) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'Scenario does not exist');
    const api = await apiWithProject(db, scenario.apiDefinitionId); if (!api) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'API definition does not exist'); const authorization = await authorizeProject(db, request, reply, api.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    await db.update(apiDefinitions).set({ defaultScenarioId: null, updatedAt: new Date() }).where(eq(apiDefinitions.defaultScenarioId, scenarioId));
    await db.delete(responseScenarios).where(eq(responseScenarios.id, scenarioId)); return reply.code(204).send();
  });

  app.post('/v1/projects/:projectId/environments', async (request, reply) => {
    const projectId = (request.params as { projectId: string }).projectId; const authorization = await authorizeProject(db, request, reply, projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return;
    const input = parse(environmentCreateSchema, request.body, reply); if (!input) return; const [environment] = await db.insert(environments).values({ ...input, projectId }).returning(); return reply.code(201).send({ data: environment });
  });

  app.get('/v1/projects/:projectId/environments', async (request, reply) => {
    const projectId = (request.params as { projectId: string }).projectId; const authorization = await authorizeProject(db, request, reply, projectId); if (!authorization || 'statusCode' in authorization) return;
    return { data: await db.select().from(environments).where(eq(environments.projectId, projectId)).orderBy(asc(environments.name)) };
  });

  app.patch('/v1/environments/:environmentId', async (request, reply) => {
    const environmentId = (request.params as { environmentId: string }).environmentId; const [environment] = await db.select().from(environments).where(eq(environments.id, environmentId)).limit(1); if (!environment) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'Environment does not exist');
    const authorization = await authorizeProject(db, request, reply, environment.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return; const input = parse(environmentUpdateSchema, request.body, reply); if (!input) return;
    const [updated] = await db.update(environments).set(input).where(eq(environments.id, environmentId)).returning(); return { data: updated };
  });

  app.put('/v1/environments/:environmentId/apis/:apiId/scenario', async (request, reply) => {
    const { environmentId, apiId } = request.params as { environmentId: string; apiId: string }; const input = parse(scenarioSelectionSchema, request.body, reply); if (!input) return;
    const [environment] = await db.select().from(environments).where(eq(environments.id, environmentId)).limit(1); const api = await apiWithProject(db, apiId); if (!environment || !api || environment.projectId !== api.projectId) return sendError(reply, 404, 'ROUTE_NOT_FOUND', 'Environment or API definition does not exist');
    const authorization = await authorizeProject(db, request, reply, api.projectId, 'EDITOR'); if (!authorization || 'statusCode' in authorization) return; const [scenario] = await db.select().from(responseScenarios).where(and(eq(responseScenarios.id, input.scenarioId), eq(responseScenarios.apiDefinitionId, apiId))).limit(1); if (!scenario) return sendError(reply, 400, 'VALIDATION_ERROR', 'Scenario must belong to the selected API definition');
    await db.insert(environmentScenarios).values({ environmentId, apiDefinitionId: apiId, scenarioId: scenario.id }).onConflictDoUpdate({ target: [environmentScenarios.environmentId, environmentScenarios.apiDefinitionId], set: { scenarioId: scenario.id } }); return { data: { environmentId, apiId, scenarioId: scenario.id } };
  });
}
