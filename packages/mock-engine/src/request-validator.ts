import {
  compileSafeRegex,
  MAX_REQUEST_SCHEMA_BYTES,
  MAX_REQUEST_SCHEMA_DEPTH,
  validateRequestSchemaDefinition,
} from '@mockflow/contracts';

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 1_048_576; // 1 MiB
export const DEFAULT_MAX_REQUEST_VALIDATION_DEPTH = 32;
export const DEFAULT_MAX_VALIDATION_STEPS = 10_000;

interface ValidationBudget {
  steps: number;
  maxSteps: number;
  exhausted: boolean;
  exhaustedPath?: string;
}

export interface RequestValidationIssue {
  path: string;
  message: string;
  keyword?: string;
}

export type RequestValidationErrorCode =
  | 'INVALID_REQUEST_BODY'
  | 'REQUEST_BODY_TOO_LARGE'
  | 'INVALID_REQUEST_SCHEMA';

export type RequestValidationResult =
  | { valid: true }
  | {
      valid: false;
      code: RequestValidationErrorCode;
      message: string;
      issues: RequestValidationIssue[];
    };

export interface RequestValidationOptions {
  maxBodyBytes?: number;
  maxSchemaBytes?: number;
  maxSchemaDepth?: number;
  maxValidationDepth?: number;
  maxValidationSteps?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Uint8Array)
  );
}

function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Uint8Array) return 'binary';
  return typeof value;
}

function matchesJsonSchemaType(value: unknown, expectedType: string): boolean {
  if (expectedType === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  if (expectedType === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return jsonTypeOf(value) === expectedType;
}

function consumeStep(budget: ValidationBudget, path: string): boolean {
  if (budget.exhausted) {
    return false;
  }
  budget.steps += 1;
  if (budget.steps > budget.maxSteps) {
    budget.exhausted = true;
    budget.exhaustedPath = path;
    return false;
  }
  return true;
}

function deepEqual(a: unknown, b: unknown, budget: ValidationBudget, path: string): boolean {
  if (!consumeStep(budget, path)) return false;
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number' && a === 0 && b === 0) {
    return true;
  }
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, idx) => deepEqual(item, b[idx], budget, path));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key], budget, path),
    );
  }
  return false;
}

function canonicalJsonKey(value: unknown, budget: ValidationBudget, path: string): string | null {
  if (!consumeStep(budget, path)) return null;
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'b:1' : 'b:0';
  if (typeof value === 'number') {
    const normalized = Object.is(value, -0) ? 0 : value;
    return `n:${String(normalized)}`;
  }
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const part = canonicalJsonKey(value[i], budget, `${path}[${i}]`);
      if (part === null) return null;
      parts.push(part);
    }
    return `[${parts.join(',')}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const valKey = canonicalJsonKey(value[key], budget, `${path}.${key}`);
      if (valKey === null) return null;
      parts.push(`${JSON.stringify(key)}:${valKey}`);
    }
    return `{${parts.join(',')}}`;
  }
  return `u:${String(value)}`;
}

function resolveLocalRef(
  rootSchema: Record<string, unknown>,
  ref: string,
): Record<string, unknown> | null {
  if (ref === '#') return rootSchema;
  if (!ref.startsWith('#/')) return null;

  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let current: unknown = rootSchema;
  for (const segment of segments) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return null;
    }
    current = current[segment];
  }

  return isPlainObject(current) ? current : null;
}

function validateNode(
  value: unknown,
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  path: string,
  depth: number,
  maxDepth: number,
  activeRefs: Set<string>,
  issues: RequestValidationIssue[],
  budget: ValidationBudget,
): void {
  if (!consumeStep(budget, path)) {
    return;
  }

  if (depth > maxDepth) {
    issues.push({
      path,
      message: `Request payload nesting depth exceeds maximum of ${maxDepth}`,
      keyword: 'maxDepth',
    });
    return;
  }

  if (typeof schema.$ref === 'string') {
    const refKey = `${schema.$ref}@${path}`;
    if (activeRefs.has(refKey)) {
      issues.push({
        path,
        message: 'Cyclic $ref detected in request schema',
        keyword: '$ref',
      });
      return;
    }

    const target = resolveLocalRef(rootSchema, schema.$ref);
    if (!target) {
      issues.push({
        path,
        message: `Unresolvable local $ref "${schema.$ref}"`,
        keyword: '$ref',
      });
      return;
    }

    activeRefs.add(refKey);
    validateNode(value, target, rootSchema, path, depth + 1, maxDepth, activeRefs, issues, budget);
    activeRefs.delete(refKey);
    if (budget.exhausted) return;
  }

  if (schema.nullable === true && value === null) {
    return;
  }

  if ('const' in schema) {
    const matched = deepEqual(value, schema.const, budget, path);
    if (budget.exhausted) return;
    if (!matched) {
      issues.push({
        path,
        message: 'Value does not match expected constant',
        keyword: 'const',
      });
    }
  }

  if (Array.isArray(schema.enum)) {
    let matchedEnum = false;
    for (const candidate of schema.enum) {
      if (deepEqual(value, candidate, budget, path)) {
        matchedEnum = true;
        break;
      }
      if (budget.exhausted) return;
    }
    if (!matchedEnum) {
      issues.push({
        path,
        message: 'Value must be one of the allowed enum values',
        keyword: 'enum',
      });
    }
  }

  if (schema.type !== undefined) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const validType = allowedTypes.some(
      (t) => typeof t === 'string' && matchesJsonSchemaType(value, t),
    );
    if (!validType) {
      issues.push({
        path,
        message: `Expected type ${allowedTypes.join(' | ')}, received ${jsonTypeOf(value)}`,
        keyword: 'type',
      });
      return;
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      issues.push({
        path,
        message: `String length must be at least ${schema.minLength}`,
        keyword: 'minLength',
      });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      issues.push({
        path,
        message: `String length must be at most ${schema.maxLength}`,
        keyword: 'maxLength',
      });
    }
    if (typeof schema.pattern === 'string') {
      const compiled = compileSafeRegex(schema.pattern);
      if (!compiled.ok) {
        issues.push({
          path,
          message: compiled.error,
          keyword: 'pattern',
        });
      } else {
        const remainingSteps = Math.max(1, budget.maxSteps - budget.steps);
        const matchResult = compiled.regex.test(value, remainingSteps * 50);
        if (matchResult.budgetExceeded) {
          budget.exhausted = true;
          budget.exhaustedPath = path;
          return;
        }
        if (!matchResult.matched) {
          issues.push({
            path,
            message: 'String does not match required pattern',
            keyword: 'pattern',
          });
        }
      }
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push({
        path,
        message: `Value must be >= ${schema.minimum}`,
        keyword: 'minimum',
      });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push({
        path,
        message: `Value must be <= ${schema.maximum}`,
        keyword: 'maximum',
      });
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      issues.push({
        path,
        message: `Value must be > ${schema.exclusiveMinimum}`,
        keyword: 'exclusiveMinimum',
      });
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      issues.push({
        path,
        message: `Value must be < ${schema.exclusiveMaximum}`,
        keyword: 'exclusiveMaximum',
      });
    }
    if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
        issues.push({
          path,
          message: `Value must be a multiple of ${schema.multipleOf}`,
          keyword: 'multipleOf',
        });
      }
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      issues.push({
        path,
        message: `Array must contain at least ${schema.minItems} items`,
        keyword: 'minItems',
      });
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      issues.push({
        path,
        message: `Array must contain at most ${schema.maxItems} items`,
        keyword: 'maxItems',
      });
    }
    if (schema.uniqueItems === true) {
      const seen = new Set<string>();
      for (let i = 0; i < value.length; i++) {
        const key = canonicalJsonKey(value[i], budget, `${path}[${i}]`);
        if (key === null || budget.exhausted) {
          return;
        }
        if (seen.has(key)) {
          issues.push({
            path,
            message: 'Array items must be unique',
            keyword: 'uniqueItems',
          });
          break;
        }
        seen.add(key);
      }
    }
    if (Array.isArray(schema.prefixItems)) {
      const tupleLimit = Math.min(value.length, schema.prefixItems.length);
      for (let i = 0; i < tupleLimit; i++) {
        if (budget.exhausted) return;
        const itemSchema = schema.prefixItems[i];
        if (isPlainObject(itemSchema)) {
          validateNode(
            value[i],
            itemSchema,
            rootSchema,
            `${path}[${i}]`,
            depth + 1,
            maxDepth,
            activeRefs,
            issues,
            budget,
          );
        }
      }
      if (schema.items === false && value.length > schema.prefixItems.length) {
        issues.push({
          path,
          message: `Array must not contain more than ${schema.prefixItems.length} items`,
          keyword: 'items',
        });
      } else if (isPlainObject(schema.items)) {
        for (let i = tupleLimit; i < value.length; i++) {
          if (budget.exhausted) return;
          validateNode(
            value[i],
            schema.items,
            rootSchema,
            `${path}[${i}]`,
            depth + 1,
            maxDepth,
            activeRefs,
            issues,
            budget,
          );
        }
      }
    } else if (schema.items === false && value.length > 0) {
      issues.push({
        path,
        message: 'Array must not contain any items',
        keyword: 'items',
      });
    } else if (isPlainObject(schema.items)) {
      for (let i = 0; i < value.length; i++) {
        if (budget.exhausted) return;
        validateNode(
          value[i],
          schema.items,
          rootSchema,
          `${path}[${i}]`,
          depth + 1,
          maxDepth,
          activeRefs,
          issues,
          budget,
        );
      }
    } else if (Array.isArray(schema.items)) {
      const tupleLimit = Math.min(value.length, schema.items.length);
      for (let i = 0; i < tupleLimit; i++) {
        if (budget.exhausted) return;
        const itemSchema = schema.items[i];
        if (isPlainObject(itemSchema)) {
          validateNode(
            value[i],
            itemSchema,
            rootSchema,
            `${path}[${i}]`,
            depth + 1,
            maxDepth,
            activeRefs,
            issues,
            budget,
          );
        }
      }
    }
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) {
      issues.push({
        path,
        message: `Object must have at least ${schema.minProperties} properties`,
        keyword: 'minProperties',
      });
    }
    if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) {
      issues.push({
        path,
        message: `Object must have at most ${schema.maxProperties} properties`,
        keyword: 'maxProperties',
      });
    }

    if (Array.isArray(schema.required)) {
      for (const reqKey of schema.required) {
        if (typeof reqKey === 'string' && !Object.prototype.hasOwnProperty.call(value, reqKey)) {
          const propPath = path === '$' ? `$.${reqKey}` : `${path}.${reqKey}`;
          issues.push({
            path: propPath,
            message: `Missing required property "${reqKey}"`,
            keyword: 'required',
          });
        }
      }
    }

    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const [key, propValue] of Object.entries(value)) {
      if (budget.exhausted) return;
      const propPath = path === '$' ? `$.${key}` : `${path}.${key}`;
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        const propSchema = properties[key];
        if (isPlainObject(propSchema)) {
          validateNode(
            propValue,
            propSchema,
            rootSchema,
            propPath,
            depth + 1,
            maxDepth,
            activeRefs,
            issues,
            budget,
          );
        }
      } else if (schema.additionalProperties === false) {
        issues.push({
          path: propPath,
          message: `Additional property "${key}" is not allowed`,
          keyword: 'additionalProperties',
        });
      } else if (isPlainObject(schema.additionalProperties)) {
        validateNode(
          propValue,
          schema.additionalProperties,
          rootSchema,
          propPath,
          depth + 1,
          maxDepth,
          activeRefs,
          issues,
          budget,
        );
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const subSchema of schema.allOf) {
      if (budget.exhausted) return;
      if (isPlainObject(subSchema)) {
        validateNode(
          value,
          subSchema,
          rootSchema,
          path,
          depth + 1,
          maxDepth,
          activeRefs,
          issues,
          budget,
        );
      }
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const anyMatched = schema.anyOf.some((subSchema) => {
      if (budget.exhausted || !isPlainObject(subSchema)) return false;
      const subIssues: RequestValidationIssue[] = [];
      validateNode(
        value,
        subSchema,
        rootSchema,
        path,
        depth + 1,
        maxDepth,
        new Set(activeRefs),
        subIssues,
        budget,
      );
      return !budget.exhausted && subIssues.length === 0;
    });
    if (budget.exhausted) return;
    if (!anyMatched) {
      issues.push({
        path,
        message: 'Value does not match any allowed schema in anyOf',
        keyword: 'anyOf',
      });
    }
  }

  if (Array.isArray(schema.oneOf)) {
    let matchCount = 0;
    for (const subSchema of schema.oneOf) {
      if (budget.exhausted) return;
      if (!isPlainObject(subSchema)) continue;
      const subIssues: RequestValidationIssue[] = [];
      validateNode(
        value,
        subSchema,
        rootSchema,
        path,
        depth + 1,
        maxDepth,
        new Set(activeRefs),
        subIssues,
        budget,
      );
      if (!budget.exhausted && subIssues.length === 0) matchCount++;
    }
    if (budget.exhausted) return;
    if (matchCount !== 1) {
      issues.push({
        path,
        message: `Value must match exactly one schema in oneOf (matched ${matchCount})`,
        keyword: 'oneOf',
      });
    }
  }

  if (isPlainObject(schema.not)) {
    const notIssues: RequestValidationIssue[] = [];
    validateNode(
      value,
      schema.not,
      rootSchema,
      path,
      depth + 1,
      maxDepth,
      new Set(activeRefs),
      notIssues,
      budget,
    );
    if (budget.exhausted) return;
    if (notIssues.length === 0) {
      issues.push({
        path,
        message: 'Value must not match schema in "not"',
        keyword: 'not',
      });
    }
  }
}

/**
 * Validates an incoming request body against an optional JSON Schema definition.
 * Enforces bounded schema size/depth, bounded request body size, no remote $ref
 * resolution, and safe error reporting.
 */
export function validateRequestBody(
  body: unknown,
  schema: Record<string, unknown>,
  options?: RequestValidationOptions,
): RequestValidationResult {
  const maxSchemaBytes = options?.maxSchemaBytes ?? MAX_REQUEST_SCHEMA_BYTES;
  const maxSchemaDepth = options?.maxSchemaDepth ?? MAX_REQUEST_SCHEMA_DEPTH;
  const schemaIssues = validateRequestSchemaDefinition(schema, {
    maxBytes: maxSchemaBytes,
    maxDepth: maxSchemaDepth,
  });

  if (schemaIssues.length > 0) {
    return {
      valid: false,
      code: 'INVALID_REQUEST_SCHEMA',
      message: 'Request validation schema is invalid or exceeds safety limits',
      issues: schemaIssues.map((issue) => ({
        path: issue.path.length > 0 ? `$.${issue.path.join('.')}` : '$',
        message: issue.message,
      })),
    };
  }

  const maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;
  if (body !== undefined && body !== null) {
    let byteLength = 0;
    if (typeof body === 'string') {
      byteLength = Buffer.byteLength(body, 'utf8');
    } else if (body instanceof Uint8Array) {
      byteLength = body.byteLength;
    } else {
      try {
        byteLength = Buffer.byteLength(JSON.stringify(body), 'utf8');
      } catch {
        return {
          valid: false,
          code: 'INVALID_REQUEST_BODY',
          message: 'Request body is not valid JSON-serializable data',
          issues: [{ path: '$', message: 'Request body cannot be serialized' }],
        };
      }
    }

    if (byteLength > maxBodyBytes) {
      return {
        valid: false,
        code: 'REQUEST_BODY_TOO_LARGE',
        message: `Request body size (${byteLength} bytes) exceeds maximum limit of ${maxBodyBytes} bytes`,
        issues: [
          {
            path: '$',
            message: `Request body exceeds ${maxBodyBytes} bytes`,
            keyword: 'maxBytes',
          },
        ],
      };
    }
  }

  const maxValidationDepth = options?.maxValidationDepth ?? DEFAULT_MAX_REQUEST_VALIDATION_DEPTH;

  const checkPayloadDepth = (node: unknown, depth: number): boolean => {
    if (depth > maxValidationDepth) return false;
    if (Array.isArray(node)) {
      return node.every((item) => checkPayloadDepth(item, depth + 1));
    }
    if (isPlainObject(node)) {
      return Object.values(node).every((val) => checkPayloadDepth(val, depth + 1));
    }
    return true;
  };

  if (!checkPayloadDepth(body, 0)) {
    return {
      valid: false,
      code: 'INVALID_REQUEST_BODY',
      message: `Request payload nesting depth exceeds maximum of ${maxValidationDepth}`,
      issues: [
        {
          path: '$',
          message: `Request payload nesting depth exceeds maximum of ${maxValidationDepth}`,
          keyword: 'maxDepth',
        },
      ],
    };
  }

  const maxValidationSteps = options?.maxValidationSteps ?? DEFAULT_MAX_VALIDATION_STEPS;
  const budget: ValidationBudget = {
    steps: 0,
    maxSteps: maxValidationSteps,
    exhausted: false,
  };

  const issues: RequestValidationIssue[] = [];
  validateNode(
    body === undefined ? null : body,
    schema,
    schema,
    '$',
    0,
    maxValidationDepth,
    new Set<string>(),
    issues,
    budget,
  );

  if (budget.exhausted) {
    return {
      valid: false,
      code: 'INVALID_REQUEST_BODY',
      message: `Request validation exceeded maximum work budget of ${budget.maxSteps} steps`,
      issues: [
        {
          path: budget.exhaustedPath ?? '$',
          message: `Request validation exceeded maximum work budget of ${budget.maxSteps} steps`,
          keyword: 'maxSteps',
        },
      ],
    };
  }

  if (issues.length > 0) {
    return {
      valid: false,
      code: 'INVALID_REQUEST_BODY',
      message: 'Request body failed JSON Schema validation',
      issues,
    };
  }

  return { valid: true };
}
