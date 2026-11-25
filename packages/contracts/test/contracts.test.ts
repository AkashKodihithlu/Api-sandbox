import { describe, expect, it } from 'vitest';
import {
  apiDefinitionCreateSchema,
  MAX_ARTIFICIAL_DELAY_MS,
  MAX_REQUEST_SCHEMA_BYTES,
  MAX_RESPONSE_BODY_BYTES,
  SCENARIO_TYPES,
  scenarioCreateSchema,
  validateRequestSchemaDefinition,
  validateScenarioConfiguration,
} from '../src/index.js';

describe('@mockflow/contracts Phase 3 validation', () => {
  describe('scenarioCreateSchema', () => {
    it('defaults type to CUSTOM when omitted and accepts all valid scenario types', () => {
      const defaultParsed = scenarioCreateSchema.parse({
        name: 'Default Custom',
        statusCode: 200,
      });
      expect(defaultParsed.type).toBe('CUSTOM');

      for (const type of SCENARIO_TYPES) {
        const parsed = scenarioCreateSchema.parse({
          name: `Scenario ${type}`,
          type,
          statusCode: 200,
          body: { ok: true },
        });
        expect(parsed.type).toBe(type);
      }
    });

    it('rejects invalid scenario types', () => {
      const result = scenarioCreateSchema.safeParse({
        name: 'Bad Type',
        type: 'RANDOM',
        statusCode: 200,
      });
      expect(result.success).toBe(false);
    });

    it('rejects prohibited hop-by-hop headers and CRLF injection on save', () => {
      const hopByHop = scenarioCreateSchema.safeParse({
        name: 'Hop-by-hop',
        statusCode: 200,
        headers: { Connection: 'keep-alive' },
      });
      expect(hopByHop.success).toBe(false);

      const crlf = scenarioCreateSchema.safeParse({
        name: 'CRLF',
        statusCode: 200,
        headers: { 'x-test': 'abc\r\nevil: true' },
      });
      expect(crlf.success).toBe(false);

      const secOverride = scenarioCreateSchema.safeParse({
        name: 'Security override',
        statusCode: 200,
        headers: { 'x-content-type-options': 'allow' },
      });
      expect(secOverride.success).toBe(false);
    });

    it('rejects non-empty bodies for 1xx, 204, 205, and 304 status codes', () => {
      for (const statusCode of [100, 204, 205, 304]) {
        const withBody = scenarioCreateSchema.safeParse({
          name: `Status ${statusCode}`,
          statusCode,
          body: { error: 'not allowed' },
        });
        expect(withBody.success).toBe(false);

        const withoutBody = scenarioCreateSchema.safeParse({
          name: `Status ${statusCode} empty`,
          statusCode,
          body: null,
        });
        expect(withoutBody.success).toBe(true);
      }
    });

    it('enforces 1 MiB response body size and 10s delay limits', () => {
      const oversized = scenarioCreateSchema.safeParse({
        name: 'Too big',
        statusCode: 200,
        body: 'x'.repeat(MAX_RESPONSE_BODY_BYTES + 1),
      });
      expect(oversized.success).toBe(false);

      const overDelay = scenarioCreateSchema.safeParse({
        name: 'Too slow',
        statusCode: 200,
        delayMs: MAX_ARTIFICIAL_DELAY_MS + 1,
      });
      expect(overDelay.success).toBe(false);
    });
  });

  describe('validateScenarioConfiguration', () => {
    it('detects invalid merged configurations for PATCH validation', () => {
      const issues = validateScenarioConfiguration({
        statusCode: 204,
        body: { existing: 'body' },
        headers: { 'x-ok': 'yes' },
        delayMs: 0,
      });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.path).toEqual(['body']);
    });
  });

  describe('requestSchema validation', () => {
    it('accepts valid JSON Schema objects on API definitions', () => {
      const parsed = apiDefinitionCreateSchema.safeParse({
        name: 'Create User',
        method: 'POST',
        path: '/users',
        requestSchema: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
          },
          additionalProperties: false,
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects remote $ref references in requestSchema', () => {
      const issues = validateRequestSchemaDefinition({
        type: 'object',
        properties: {
          user: { $ref: 'https://evil.example/schema.json' },
        },
      });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.message).toContain('$ref');
    });

    it('allows local #/ $ref references in requestSchema', () => {
      const issues = validateRequestSchemaDefinition({
        type: 'object',
        $defs: {
          id: { type: 'string' },
        },
        properties: {
          id: { $ref: '#/$defs/id' },
        },
      });
      expect(issues).toEqual([]);
    });

    it('rejects oversized or overly deep requestSchema', () => {
      const big = {
        type: 'object',
        description: 'a'.repeat(MAX_REQUEST_SCHEMA_BYTES),
      };
      expect(validateRequestSchemaDefinition(big).length).toBeGreaterThan(0);

      let deep: Record<string, unknown> = { type: 'string' };
      for (let i = 0; i < 15; i++) {
        deep = { type: 'object', properties: { nested: deep } };
      }
      expect(validateRequestSchemaDefinition(deep).length).toBeGreaterThan(0);
    });

    it('allows user properties named "type" or "required" and objects inside const/default', () => {
      const issues = validateRequestSchemaDefinition({
        type: 'object',
        properties: {
          type: { type: 'string', const: 'event' },
          required: { type: 'boolean', default: false },
          metadata: {
            type: 'object',
            const: { type: 'internal-tag' },
          },
        },
        required: ['type'],
      });
      expect(issues).toEqual([]);
    });

    it('rejects unsupported validation keywords and unsupported/malformed regex patterns', () => {
      const unsupported = validateRequestSchemaDefinition({
        type: 'object',
        if: { properties: { kind: { const: 'a' } } },
        then: { required: ['a'] },
      });
      expect(unsupported.length).toBeGreaterThan(0);
      expect(unsupported[0]?.message).toContain('Unsupported JSON Schema keyword');

      const lookahead = validateRequestSchemaDefinition({
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^(?=a)a+$' },
        },
      });
      expect(lookahead.length).toBeGreaterThan(0);
      expect(lookahead[0]?.path).toEqual(['properties', 'code', 'pattern']);

      const backref = validateRequestSchemaDefinition({
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^(a)\\1$' },
        },
      });
      expect(backref.length).toBeGreaterThan(0);

      const unclosed = validateRequestSchemaDefinition({
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^[a-z' },
        },
      });
      expect(unclosed.length).toBeGreaterThan(0);

      const excessiveRepeat = validateRequestSchemaDefinition({
        type: 'object',
        properties: {
          code: { type: 'string', pattern: '^a{200}$' },
        },
      });
      expect(excessiveRepeat.length).toBeGreaterThan(0);
    });

    it('rejects malformed $defs, definitions, additionalProperties, items, and prefixItems', () => {
      expect(
        validateRequestSchemaDefinition({
          type: 'object',
          $defs: { badDef: 'not-an-object' },
        })[0]?.path,
      ).toEqual(['$defs', 'badDef']);

      expect(
        validateRequestSchemaDefinition({
          type: 'object',
          definitions: { badDef: 123 },
        })[0]?.path,
      ).toEqual(['definitions', 'badDef']);

      expect(
        validateRequestSchemaDefinition({
          type: 'object',
          additionalProperties: 'false',
        })[0]?.path,
      ).toEqual(['additionalProperties']);

      expect(
        validateRequestSchemaDefinition({
          type: 'array',
          items: 'string',
        })[0]?.path,
      ).toEqual(['items']);

      expect(
        validateRequestSchemaDefinition({
          type: 'array',
          items: [{ type: 'string' }, 'bad-tuple-item'],
        })[0]?.path,
      ).toEqual(['items', 1]);

      expect(
        validateRequestSchemaDefinition({
          type: 'array',
          prefixItems: [{ type: 'string' }, 42],
        })[0]?.path,
      ).toEqual(['prefixItems', 1]);

      // Valid boolean and schema forms remain accepted
      expect(
        validateRequestSchemaDefinition({
          type: 'object',
          additionalProperties: { type: 'string' },
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            pair: { type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }] },
          },
        }),
      ).toEqual([]);
    });

    it('allows standard JSON Schema metadata keywords while rejecting unknown or misspelled keywords', () => {
      const validWithMetadata = validateRequestSchemaDefinition({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'UserPayload',
        description: 'Creates a new user',
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
            examples: ['user@example.com'],
            readOnly: false,
            deprecated: false,
          },
        },
      });
      expect(validWithMetadata).toEqual([]);

      const misspelled = validateRequestSchemaDefinition({
        type: 'object',
        requird: ['email'],
        properties: {
          email: { type: 'string', min_length: 3 },
        },
      });
      expect(misspelled.length).toBe(2);
      expect(misspelled.map((i) => i.path)).toEqual([
        ['requird'],
        ['properties', 'email', 'min_length'],
      ]);
    });

    it('rejects prefixItems combined with array items, while allowing items: false or schema object', () => {
      const invalidCombo = validateRequestSchemaDefinition({
        type: 'array',
        prefixItems: [{ type: 'string' }],
        items: [{ type: 'number' }],
      });
      expect(invalidCombo.length).toBe(1);
      expect(invalidCombo[0]?.path).toEqual(['items']);

      expect(
        validateRequestSchemaDefinition({
          type: 'array',
          prefixItems: [{ type: 'string' }],
          items: false,
        }),
      ).toEqual([]);
    });
  });
});
