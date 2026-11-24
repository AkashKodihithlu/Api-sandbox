import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).default([]),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  description: z.string().trim().max(500).optional(),
});
export const projectUpdateSchema = projectCreateSchema.partial().extend({
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

export const apiDefinitionCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().trim().regex(/^\//).max(500),
  description: z.string().trim().max(500).optional(),
  requestSchema: z.record(z.unknown()).optional(),
});
export const apiDefinitionUpdateSchema = apiDefinitionCreateSchema.partial().extend({
  isPublished: z.boolean().optional(),
  defaultScenarioId: z.string().uuid().nullable().optional(),
});

export const scenarioCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  statusCode: z.number().int().min(100).max(599),
  headers: z.record(z.string()).default({}),
  body: z.unknown().nullable().default(null),
  delayMs: z.number().int().min(0).max(10_000).default(0),
  isDefault: z.boolean().default(false),
});
export const scenarioUpdateSchema = scenarioCreateSchema.partial();

export const environmentCreateSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const environmentUpdateSchema = environmentCreateSchema;

export function normalizedRoutePath(path: string): string {
  const normalized = path.replace(/\/+/g, '/').replace(/\/{2,}/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}
