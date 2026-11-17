import { z } from 'zod';

const baseEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const controlApiEnvironmentSchema = baseEnvironmentSchema.extend({
  CONTROL_API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
});

const runtimeEnvironmentSchema = baseEnvironmentSchema.extend({
  RUNTIME_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  DATABASE_URL: z.string().url(),
  REQUEST_BODY_MAX_BYTES: z.coerce.number().int().positive().default(1_048_576),
  RESPONSE_BODY_MAX_BYTES: z.coerce.number().int().positive().default(1_048_576),
  MAX_ARTIFICIAL_DELAY_MS: z.coerce.number().int().nonnegative().default(10_000),
});

export function parseControlApiEnvironment(environment: NodeJS.ProcessEnv) {
  return controlApiEnvironmentSchema.parse(environment);
}

export function parseRuntimeEnvironment(environment: NodeJS.ProcessEnv) {
  return runtimeEnvironmentSchema.parse(environment);
}
