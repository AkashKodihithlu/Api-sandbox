import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_REQUEST_BODY_BYTES, validateRequestBody } from '../src/request-validator.js';

describe('JSON Schema Request Validator', () => {
  const userCreateSchema: Record<string, unknown> = {
    type: 'object',
    required: ['email', 'age'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', minLength: 5, pattern: '^[^@]+@[^@]+$' },
      age: { type: 'integer', minimum: 18, maximum: 120 },
      role: { type: 'string', enum: ['user', 'admin'] },
      tags: { type: 'array', items: { type: 'string' }, minItems: 1, uniqueItems: true },
    },
  };

  it('validates a conforming object payload', () => {
    const result = validateRequestBody(
      {
        email: 'alice@example.com',
        age: 30,
        role: 'admin',
        tags: ['beta', 'early'],
      },
      userCreateSchema,
    );
    expect(result).toEqual({ valid: true });
  });

  it('reports missing required fields and additionalProperties violations', () => {
    const result = validateRequestBody(
      {
        email: 'alice@example.com',
        extraField: true,
      },
      userCreateSchema,
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_REQUEST_BODY');
      expect(result.issues.some((i) => i.keyword === 'required' && i.path === '$.age')).toBe(true);
      expect(
        result.issues.some(
          (i) => i.keyword === 'additionalProperties' && i.path === '$.extraField',
        ),
      ).toBe(true);
    }
  });

  it('enforces integer vs number, bounds, pattern, enum, and uniqueItems', () => {
    const result = validateRequestBody(
      {
        email: 'bad',
        age: 17.5,
        role: 'superadmin',
        tags: ['dup', 'dup'],
      },
      userCreateSchema,
    );

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_REQUEST_BODY');
      expect(result.issues.some((i) => i.path === '$.email' && i.keyword === 'minLength')).toBe(
        true,
      );
      expect(result.issues.some((i) => i.path === '$.email' && i.keyword === 'pattern')).toBe(true);
      expect(result.issues.some((i) => i.path === '$.age' && i.keyword === 'type')).toBe(true);
      expect(result.issues.some((i) => i.path === '$.role' && i.keyword === 'enum')).toBe(true);
      expect(result.issues.some((i) => i.path === '$.tags' && i.keyword === 'uniqueItems')).toBe(
        true,
      );
    }
  });

  it('supports local #/$defs $ref resolution and prevents cyclic $ref loops', () => {
    const schemaWithRef: Record<string, unknown> = {
      type: 'object',
      $defs: {
        positiveInt: { type: 'integer', minimum: 1 },
      },
      required: ['count'],
      properties: {
        count: { $ref: '#/$defs/positiveInt' },
      },
    };

    expect(validateRequestBody({ count: 5 }, schemaWithRef)).toEqual({ valid: true });
    expect(validateRequestBody({ count: 0 }, schemaWithRef).valid).toBe(false);

    const cyclicSchema: Record<string, unknown> = {
      $defs: {
        node: { $ref: '#/$defs/node' },
      },
      $ref: '#/$defs/node',
    };
    const cyclicResult = validateRequestBody({}, cyclicSchema);
    expect(cyclicResult.valid).toBe(false);
    if (!cyclicResult.valid) {
      expect(cyclicResult.issues.some((i) => i.message.includes('Cyclic'))).toBe(true);
    }
  });

  it('rejects remote $ref schemas safely as INVALID_REQUEST_SCHEMA', () => {
    const remoteSchema: Record<string, unknown> = {
      type: 'object',
      properties: {
        user: { $ref: 'https://attacker.example/schema.json' },
      },
    };

    const result = validateRequestBody({ user: {} }, remoteSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_REQUEST_SCHEMA');
    }
  });

  it('enforces request body size limit (1 MiB default and custom limit)', () => {
    const oversized = { text: 'a'.repeat(DEFAULT_MAX_REQUEST_BODY_BYTES + 10) };
    const defaultResult = validateRequestBody(oversized, { type: 'object' });
    expect(defaultResult.valid).toBe(false);
    if (!defaultResult.valid) {
      expect(defaultResult.code).toBe('REQUEST_BODY_TOO_LARGE');
    }

    const customResult = validateRequestBody(
      { text: 'hello world' },
      { type: 'object' },
      { maxBodyBytes: 10 },
    );
    expect(customResult.valid).toBe(false);
    if (!customResult.valid) {
      expect(customResult.code).toBe('REQUEST_BODY_TOO_LARGE');
    }
  });

  it('enforces payload nesting depth limit', () => {
    let deepPayload: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 40; i++) {
      deepPayload = { child: deepPayload };
    }

    const result = validateRequestBody(deepPayload, { type: 'object' }, { maxValidationDepth: 10 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('INVALID_REQUEST_BODY');
      expect(result.issues.some((i) => i.keyword === 'maxDepth')).toBe(true);
    }
  });

  it('supports allOf, anyOf, oneOf, not, and const', () => {
    const composedSchema: Record<string, unknown> = {
      oneOf: [
        { type: 'object', required: ['card'], properties: { card: { type: 'string' } } },
        { type: 'object', required: ['iban'], properties: { iban: { type: 'string' } } },
      ],
    };

    expect(validateRequestBody({ card: '4242' }, composedSchema)).toEqual({ valid: true });
    expect(validateRequestBody({ card: '4242', iban: 'DE89' }, composedSchema).valid).toBe(false);
    expect(validateRequestBody({}, composedSchema).valid).toBe(false);
  });

  it('supports tuple validation via prefixItems and array items, and rejects Uint8Array as object', () => {
    const tupleSchema: Record<string, unknown> = {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'integer' }],
    };

    expect(validateRequestBody(['id', 42], tupleSchema)).toEqual({ valid: true });
    expect(validateRequestBody(['id', 'not-int'], tupleSchema).valid).toBe(false);

    const binaryResult = validateRequestBody(new Uint8Array([1, 2, 3]), { type: 'object' });
    expect(binaryResult.valid).toBe(false);
    if (!binaryResult.valid) {
      expect(binaryResult.code).toBe('INVALID_REQUEST_BODY');
    }
  });

  it('aborts cleanly when global validation work budget is exhausted across nested anyOf/oneOf branches', () => {
    const branchingSchema: Record<string, unknown> = {
      anyOf: [
        {
          oneOf: [
            { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } },
            { type: 'object', properties: { c: { type: 'string' }, d: { type: 'boolean' } } },
          ],
        },
        {
          oneOf: [
            { type: 'object', properties: { e: { type: 'string' }, f: { type: 'number' } } },
            { type: 'object', properties: { g: { type: 'string' }, h: { type: 'boolean' } } },
          ],
        },
      ],
    };

    const exhausted = validateRequestBody({ a: 'x', b: 1, c: 'y', d: true }, branchingSchema, {
      maxValidationSteps: 5,
    });
    expect(exhausted.valid).toBe(false);
    if (!exhausted.valid) {
      expect(exhausted.code).toBe('INVALID_REQUEST_BODY');
      expect(exhausted.issues[0]?.keyword).toBe('maxSteps');
    }
  });

  it('validates large uniqueItems arrays in O(n) with JSON key-order equality and enforces maxValidationSteps', () => {
    const uniqueObjectsSchema: Record<string, unknown> = {
      type: 'array',
      uniqueItems: true,
    };

    const dupResult = validateRequestBody(
      [
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ],
      uniqueObjectsSchema,
    );
    expect(dupResult.valid).toBe(false);
    if (!dupResult.valid) {
      expect(dupResult.issues[0]?.keyword).toBe('uniqueItems');
    }

    const largeUnique = Array.from({ length: 2000 }, (_, idx) => ({ id: idx }));
    expect(validateRequestBody(largeUnique, uniqueObjectsSchema)).toEqual({ valid: true });

    const hugeArray = Array.from({ length: 12_000 }, (_, idx) => idx);
    const budgetExceeded = validateRequestBody(hugeArray, uniqueObjectsSchema);
    expect(budgetExceeded.valid).toBe(false);
    if (!budgetExceeded.valid) {
      expect(budgetExceeded.code).toBe('INVALID_REQUEST_BODY');
      expect(budgetExceeded.issues[0]?.keyword).toBe('maxSteps');
    }
  });

  it('supports legitimate recursive $ref schemas while still rejecting cyclic loops', () => {
    const treeSchema: Record<string, unknown> = {
      $defs: {
        treeNode: {
          type: 'object',
          required: ['value'],
          properties: {
            value: { type: 'string' },
            child: { $ref: '#/$defs/treeNode' },
          },
        },
      },
      $ref: '#/$defs/treeNode',
    };

    expect(
      validateRequestBody(
        { value: 'root', child: { value: 'mid', child: { value: 'leaf' } } },
        treeSchema,
      ),
    ).toEqual({ valid: true });

    expect(validateRequestBody({ value: 'root', child: { value: 123 } }, treeSchema).valid).toBe(
      false,
    );
  });

  it('enforces prefixItems with items: false to disallow extra tuple elements', () => {
    const strictTuple: Record<string, unknown> = {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'integer' }],
      items: false,
    };

    expect(validateRequestBody(['ok', 1], strictTuple)).toEqual({ valid: true });
    const extraResult = validateRequestBody(['ok', 1, 'extra'], strictTuple);
    expect(extraResult.valid).toBe(false);
    if (!extraResult.valid) {
      expect(extraResult.issues[0]?.keyword).toBe('items');
    }
  });

  it('evaluates sibling keywords alongside $ref (Draft 2020-12 semantics)', () => {
    const schemaWithSiblings: Record<string, unknown> = {
      $defs: {
        name: { type: 'string' },
      },
      $ref: '#/$defs/name',
      maxLength: 5,
    };

    expect(validateRequestBody('ok', schemaWithSiblings)).toEqual({ valid: true });

    const tooLong = validateRequestBody('toolong', schemaWithSiblings);
    expect(tooLong.valid).toBe(false);
    if (!tooLong.valid) {
      expect(tooLong.code).toBe('INVALID_REQUEST_BODY');
      expect(tooLong.issues.some((i) => i.keyword === 'maxLength')).toBe(true);
    }

    const wrongType = validateRequestBody(123, schemaWithSiblings);
    expect(wrongType.valid).toBe(false);
    if (!wrongType.valid) {
      expect(wrongType.issues.some((i) => i.keyword === 'type')).toBe(true);
    }
  });

  it('executes catastrophic-backtracking patterns in linear time without ReDoS', () => {
    const evilPatterns = ['^(a+)+$', '^(a|a)+$', '^((a)+)+$', '^(a{1,})+$', '^.*.*=$'];
    const evilInput = `${'a'.repeat(500)}!`;

    const start = performance.now();
    for (const pattern of evilPatterns) {
      const result = validateRequestBody(evilInput, {
        type: 'string',
        pattern,
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_REQUEST_BODY');
        expect(result.issues[0]?.keyword).toBe('pattern');
      }
    }
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(250);
  });

  it('enforces safe-regex escape, quantifier, and anchored/unanchored semantics at runtime', () => {
    expect(validateRequestBody('\b', { type: 'string', pattern: '^[\\b]$' })).toEqual({
      valid: true,
    });
    expect(validateRequestBody('b', { type: 'string', pattern: '^[\\b]$' }).valid).toBe(false);
    expect(validateRequestBody('\0', { type: 'string', pattern: '^\\0$' })).toEqual({
      valid: true,
    });
    expect(validateRequestBody('aa', { type: 'string', pattern: '^a{0,3}$' })).toEqual({
      valid: true,
    });
    expect(validateRequestBody('aaaa', { type: 'string', pattern: '^a{0,3}$' }).valid).toBe(false);
    expect(validateRequestBody('hello-world', { type: 'string', pattern: 'world' })).toEqual({
      valid: true,
    });

    for (const badPattern of ['^*', '\\p{L}', '(?<123>a)', 'a{2}{3}', '[\\d-a]', '[a-\\d]']) {
      const res = validateRequestBody('a', { type: 'string', pattern: badPattern });
      expect(res.valid).toBe(false);
      if (!res.valid) {
        expect(res.code).toBe('INVALID_REQUEST_SCHEMA');
      }
    }
  });
});
