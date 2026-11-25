import { z } from 'zod';
import { validateRegexPattern } from './safe-regex.js';

export * from './safe-regex.js';

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

export const MAX_RESPONSE_BODY_BYTES = 1_048_576; // 1 MiB
export const MAX_ARTIFICIAL_DELAY_MS = 10_000; // 10 seconds
export const MAX_REQUEST_SCHEMA_BYTES = 65_536; // 64 KiB
export const MAX_REQUEST_SCHEMA_DEPTH = 10;

export const SCENARIO_TYPES = [
  'SUCCESS',
  'EMPTY',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'SERVER_ERROR',
  'CUSTOM',
] as const;

export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const scenarioTypeSchema = z.enum(SCENARIO_TYPES);

export const PROHIBITED_HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'proxy-connection',
  'content-length',
  'host',
] as const;

export const MANDATORY_SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
};

const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isNoBodyStatusCode(statusCode: number): boolean {
  return (
    statusCode === 204 ||
    statusCode === 205 ||
    statusCode === 304 ||
    (statusCode >= 100 && statusCode < 200)
  );
}

export interface ScenarioValidationIssue {
  path: (string | number)[];
  message: string;
}

/**
 * Validates a complete scenario configuration (headers, status/body rules, body size, serializability).
 * Used both by Zod schemas on create and for validating merged scenario state on PATCH.
 */
export function validateScenarioConfiguration(config: {
  statusCode: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
}): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];

  if (!Number.isInteger(config.statusCode) || config.statusCode < 100 || config.statusCode > 599) {
    issues.push({
      path: ['statusCode'],
      message: 'Status code must be an integer between 100 and 599',
    });
  }

  if (
    config.delayMs !== undefined &&
    (!Number.isInteger(config.delayMs) ||
      config.delayMs < 0 ||
      config.delayMs > MAX_ARTIFICIAL_DELAY_MS)
  ) {
    issues.push({
      path: ['delayMs'],
      message: `Delay must be an integer between 0 and ${MAX_ARTIFICIAL_DELAY_MS} ms`,
    });
  }

  if (config.headers) {
    for (const [name, value] of Object.entries(config.headers)) {
      if (!name || !HEADER_NAME_REGEX.test(name)) {
        issues.push({
          path: ['headers', name],
          message: `Invalid header name "${name}"`,
        });
        continue;
      }

      const lower = name.toLowerCase();
      if ((PROHIBITED_HOP_BY_HOP_HEADERS as readonly string[]).includes(lower)) {
        issues.push({
          path: ['headers', name],
          message: `Header "${name}" is a prohibited hop-by-hop or framing header`,
        });
      }

      if (value.includes('\r') || value.includes('\n') || value.includes('\0')) {
        issues.push({
          path: ['headers', name],
          message: `Header "${name}" value contains prohibited control characters`,
        });
      }

      if (
        MANDATORY_SECURITY_HEADERS[lower] &&
        value.trim().toLowerCase() !== MANDATORY_SECURITY_HEADERS[lower]
      ) {
        issues.push({
          path: ['headers', name],
          message: `Header "${name}" cannot override mandatory security value "${MANDATORY_SECURITY_HEADERS[lower]}"`,
        });
      }
    }
  }

  const hasNonEmptyBody =
    config.body !== null &&
    config.body !== undefined &&
    (typeof config.body !== 'string' || config.body.length > 0);

  if (isNoBodyStatusCode(config.statusCode) && hasNonEmptyBody) {
    issues.push({
      path: ['body'],
      message: `Status code ${config.statusCode} must not include a response body`,
    });
  }

  if (config.body !== null && config.body !== undefined) {
    let serialized: string;
    if (typeof config.body === 'string') {
      serialized = config.body;
    } else {
      try {
        serialized = JSON.stringify(config.body);
      } catch {
        issues.push({
          path: ['body'],
          message: 'Response body must be JSON-serializable',
        });
        return issues;
      }
    }

    const bytes = new TextEncoder().encode(serialized).byteLength;
    if (bytes > MAX_RESPONSE_BODY_BYTES) {
      issues.push({
        path: ['body'],
        message: `Response body size (${bytes} bytes) exceeds maximum limit of ${MAX_RESPONSE_BODY_BYTES} bytes`,
      });
    }
  }

  return issues;
}

const VALID_JSON_SCHEMA_TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);

const SUPPORTED_VALIDATION_KEYWORDS = new Set([
  '$ref',
  '$defs',
  'definitions',
  'type',
  'const',
  'enum',
  'nullable',
  'properties',
  'required',
  'additionalProperties',
  'minProperties',
  'maxProperties',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
]);

const ALLOWED_METADATA_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'readOnly',
  'writeOnly',
  'deprecated',
  'format',
  'contentMediaType',
  'contentEncoding',
]);

const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'patternProperties',
  'dependentSchemas',
  'dependentRequired',
  'dependencies',
  'contains',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates that a candidate JSON Schema is structurally safe, bounded in size and depth,
 * does not contain remote $ref references, and uses only supported validation keywords.
 */
export function validateRequestSchemaDefinition(
  schema: unknown,
  options?: { maxBytes?: number; maxDepth?: number },
): ScenarioValidationIssue[] {
  const issues: ScenarioValidationIssue[] = [];
  if (!isPlainObject(schema)) {
    issues.push({
      path: [],
      message: 'requestSchema must be a JSON object',
    });
    return issues;
  }

  const maxBytes = options?.maxBytes ?? MAX_REQUEST_SCHEMA_BYTES;
  const maxDepth = options?.maxDepth ?? MAX_REQUEST_SCHEMA_DEPTH;

  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch {
    issues.push({
      path: [],
      message: 'requestSchema must be JSON-serializable',
    });
    return issues;
  }

  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > maxBytes) {
    issues.push({
      path: [],
      message: `requestSchema size (${bytes} bytes) exceeds maximum limit of ${maxBytes} bytes`,
    });
    return issues;
  }

  const checkDepthOnly = (node: unknown, depth: number, path: (string | number)[]) => {
    if (depth > maxDepth) {
      issues.push({
        path,
        message: `requestSchema nesting depth exceeds maximum of ${maxDepth}`,
      });
      return;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        checkDepthOnly(node[i], depth + 1, [...path, i]);
      }
    } else if (isPlainObject(node)) {
      for (const [k, v] of Object.entries(node)) {
        checkDepthOnly(v, depth + 1, [...path, k]);
      }
    }
  };

  const validateSchemaNode = (
    node: Record<string, unknown>,
    depth: number,
    path: (string | number)[],
  ) => {
    if (depth > maxDepth) {
      issues.push({
        path,
        message: `requestSchema nesting depth exceeds maximum of ${maxDepth}`,
      });
      return;
    }

    for (const key of Object.keys(node)) {
      if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) {
        issues.push({
          path: [...path, key],
          message: `Unsupported JSON Schema keyword "${key}" in requestSchema`,
        });
      } else if (!SUPPORTED_VALIDATION_KEYWORDS.has(key) && !ALLOWED_METADATA_KEYWORDS.has(key)) {
        issues.push({
          path: [...path, key],
          message: `Unknown or unsupported JSON Schema keyword "${key}" in requestSchema`,
        });
      }
    }

    if ('$ref' in node) {
      const ref = node.$ref;
      if (typeof ref !== 'string' || !ref.startsWith('#')) {
        issues.push({
          path: [...path, '$ref'],
          message: 'Remote or non-local $ref references are not permitted in requestSchema',
        });
      }
    }

    if ('type' in node && node.type !== undefined) {
      const schemaType = node.type;
      if (typeof schemaType === 'string') {
        if (!VALID_JSON_SCHEMA_TYPES.has(schemaType)) {
          issues.push({
            path: [...path, 'type'],
            message: `Invalid JSON Schema type "${schemaType}"`,
          });
        }
      } else if (Array.isArray(schemaType)) {
        if (
          schemaType.length === 0 ||
          schemaType.some((t) => typeof t !== 'string' || !VALID_JSON_SCHEMA_TYPES.has(t))
        ) {
          issues.push({
            path: [...path, 'type'],
            message: 'Invalid JSON Schema type array',
          });
        }
      } else {
        issues.push({
          path: [...path, 'type'],
          message: 'JSON Schema "type" must be a string or array of strings',
        });
      }
    }

    if ('pattern' in node && node.pattern !== undefined) {
      const patternError = validateRegexPattern(node.pattern);
      if (patternError) {
        issues.push({
          path: [...path, 'pattern'],
          message: patternError,
        });
      }
    }

    if ('properties' in node && node.properties !== undefined) {
      if (!isPlainObject(node.properties)) {
        issues.push({
          path: [...path, 'properties'],
          message: 'JSON Schema "properties" must be an object',
        });
      } else {
        for (const [propName, propSchema] of Object.entries(node.properties)) {
          if (isPlainObject(propSchema)) {
            validateSchemaNode(propSchema, depth + 2, [...path, 'properties', propName]);
          } else {
            issues.push({
              path: [...path, 'properties', propName],
              message: `Property schema "${propName}" must be an object`,
            });
          }
        }
      }
    }

    if ('required' in node && node.required !== undefined) {
      if (!Array.isArray(node.required) || node.required.some((item) => typeof item !== 'string')) {
        issues.push({
          path: [...path, 'required'],
          message: 'JSON Schema "required" must be an array of strings',
        });
      }
    }

    if ('additionalProperties' in node && node.additionalProperties !== undefined) {
      if (isPlainObject(node.additionalProperties)) {
        validateSchemaNode(node.additionalProperties, depth + 1, [...path, 'additionalProperties']);
      } else if (typeof node.additionalProperties !== 'boolean') {
        issues.push({
          path: [...path, 'additionalProperties'],
          message: 'JSON Schema "additionalProperties" must be a boolean or an object',
        });
      }
    }

    for (const defsKey of ['$defs', 'definitions'] as const) {
      if (defsKey in node && node[defsKey] !== undefined) {
        if (!isPlainObject(node[defsKey])) {
          issues.push({
            path: [...path, defsKey],
            message: `JSON Schema "${defsKey}" must be an object`,
          });
        } else {
          for (const [defName, defSchema] of Object.entries(node[defsKey])) {
            if (isPlainObject(defSchema)) {
              validateSchemaNode(defSchema, depth + 2, [...path, defsKey, defName]);
            } else {
              issues.push({
                path: [...path, defsKey, defName],
                message: `Definition "${defName}" in "${defsKey}" must be an object`,
              });
            }
          }
        }
      }
    }

    if ('items' in node && node.items !== undefined) {
      if (isPlainObject(node.items)) {
        validateSchemaNode(node.items, depth + 1, [...path, 'items']);
      } else if (Array.isArray(node.items)) {
        if ('prefixItems' in node && node.prefixItems !== undefined) {
          issues.push({
            path: [...path, 'items'],
            message: 'JSON Schema "items" cannot be an array when "prefixItems" is present',
          });
        } else {
          for (let i = 0; i < node.items.length; i++) {
            const itemSchema = node.items[i];
            if (isPlainObject(itemSchema)) {
              validateSchemaNode(itemSchema, depth + 2, [...path, 'items', i]);
            } else {
              issues.push({
                path: [...path, 'items', i],
                message: `Tuple item schema at index ${i} must be an object`,
              });
            }
          }
        }
      } else if (typeof node.items !== 'boolean') {
        issues.push({
          path: [...path, 'items'],
          message:
            'JSON Schema "items" must be a boolean, an object, or an array of schema objects',
        });
      }
    }

    if ('prefixItems' in node && node.prefixItems !== undefined) {
      if (!Array.isArray(node.prefixItems)) {
        issues.push({
          path: [...path, 'prefixItems'],
          message: 'JSON Schema "prefixItems" must be an array of schema objects',
        });
      } else {
        for (let i = 0; i < node.prefixItems.length; i++) {
          const itemSchema = node.prefixItems[i];
          if (isPlainObject(itemSchema)) {
            validateSchemaNode(itemSchema, depth + 2, [...path, 'prefixItems', i]);
          } else {
            issues.push({
              path: [...path, 'prefixItems', i],
              message: `prefixItems schema at index ${i} must be an object`,
            });
          }
        }
      }
    }

    for (const combinator of ['allOf', 'anyOf', 'oneOf'] as const) {
      if (combinator in node && node[combinator] !== undefined) {
        if (!Array.isArray(node[combinator])) {
          issues.push({
            path: [...path, combinator],
            message: `JSON Schema "${combinator}" must be an array`,
          });
        } else {
          for (let i = 0; i < node[combinator].length; i++) {
            const sub = node[combinator][i];
            if (isPlainObject(sub)) {
              validateSchemaNode(sub, depth + 2, [...path, combinator, i]);
            } else {
              issues.push({
                path: [...path, combinator, i],
                message: `Schema entry in "${combinator}" at index ${i} must be an object`,
              });
            }
          }
        }
      }
    }

    if ('not' in node && node.not !== undefined) {
      if (isPlainObject(node.not)) {
        validateSchemaNode(node.not, depth + 1, [...path, 'not']);
      } else {
        issues.push({
          path: [...path, 'not'],
          message: 'JSON Schema "not" must be an object',
        });
      }
    }

    for (const valueKey of ['const', 'default', 'enum', 'examples'] as const) {
      if (valueKey in node) {
        checkDepthOnly(node[valueKey], depth + 1, [...path, valueKey]);
      }
    }
  };

  validateSchemaNode(schema, 0, []);
  return issues;
}

export const requestSchemaDefinitionSchema = z.record(z.unknown()).superRefine((schema, ctx) => {
  const issues = validateRequestSchemaDefinition(schema);
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
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
  requestSchema: requestSchemaDefinitionSchema.nullable().optional(),
});
export const apiDefinitionUpdateSchema = apiDefinitionCreateSchema.partial().extend({
  isPublished: z.boolean().optional(),
  defaultScenarioId: z.string().uuid().nullable().optional(),
});

const baseScenarioSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: scenarioTypeSchema.default('CUSTOM'),
  statusCode: z.number().int().min(100).max(599),
  headers: z.record(z.string()).default({}),
  body: z.unknown().nullable().default(null),
  delayMs: z.number().int().min(0).max(MAX_ARTIFICIAL_DELAY_MS).default(0),
  isDefault: z.boolean().default(false),
});

export const scenarioCreateSchema = baseScenarioSchema.superRefine((data, ctx) => {
  const issues = validateScenarioConfiguration(data);
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    });
  }
});

export const scenarioUpdateSchema = baseScenarioSchema.partial();

export const environmentCreateSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const environmentUpdateSchema = environmentCreateSchema;

export function normalizedRoutePath(path: string): string {
  const normalized = path.replace(/\/+/g, '/').replace(/\/{2,}/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}
