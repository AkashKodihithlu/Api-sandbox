import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const projectStatus = pgEnum('project_status', ['ACTIVE', 'ARCHIVED']);
export const projectRole = pgEnum('project_role', ['OWNER', 'EDITOR', 'VIEWER']);
export const httpMethod = pgEnum('http_method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  displayName: varchar('display_name', { length: 120 }),
  passwordHash: text('password_hash').notNull(),
  ...timestamps,
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 120 }).notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    description: varchar('description', { length: 500 }),
    status: projectStatus('status').notNull().default('ACTIVE'),
    ...timestamps,
  },
  (table) => [uniqueIndex('projects_slug_unique').on(table.slug)],
);

export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: projectRole('role').notNull().default('VIEWER'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
);

export const apiDefinitions = pgTable(
  'api_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    method: httpMethod('method').notNull(),
    path: varchar('path', { length: 500 }).notNull(),
    description: varchar('description', { length: 500 }),
    requestSchema: jsonb('request_schema'),
    defaultScenarioId: uuid('default_scenario_id'),
    isPublished: boolean('is_published').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('api_definitions_project_method_path_unique').on(table.projectId, table.method, table.path)],
);

export const responseScenarios = pgTable(
  'response_scenarios',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    apiDefinitionId: uuid('api_definition_id').notNull().references(() => apiDefinitions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    statusCode: integer('status_code').notNull(),
    headers: jsonb('headers').notNull().default({}),
    body: jsonb('body'),
    delayMs: integer('delay_ms').notNull().default(0),
    isDefault: boolean('is_default').notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex('response_scenarios_api_name_unique').on(table.apiDefinitionId, table.name)],
);

export const environments = pgTable(
  'environments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('environments_project_name_unique').on(table.projectId, table.name)],
);

export const environmentScenarios = pgTable(
  'environment_scenarios',
  {
    environmentId: uuid('environment_id').notNull().references(() => environments.id, { onDelete: 'cascade' }),
    apiDefinitionId: uuid('api_definition_id').notNull().references(() => apiDefinitions.id, { onDelete: 'cascade' }),
    scenarioId: uuid('scenario_id').notNull().references(() => responseScenarios.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.environmentId, table.apiDefinitionId] })],
);

export const requestLogs = pgTable('request_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  apiDefinitionId: uuid('api_definition_id').references(() => apiDefinitions.id, { onDelete: 'set null' }),
  scenarioId: uuid('scenario_id').references(() => responseScenarios.id, { onDelete: 'set null' }),
  method: varchar('method', { length: 16 }).notNull(),
  path: varchar('path', { length: 500 }).notNull(),
  statusCode: integer('status_code').notNull(),
  durationMs: integer('duration_ms').notNull(),
  requestBytes: integer('request_bytes').notNull().default(0),
  responseBytes: integer('response_bytes').notNull().default(0),
  redactedHeaders: jsonb('redacted_headers').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
