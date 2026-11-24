import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_ARTIFICIAL_DELAY_MS,
  DEFAULT_MAX_RESPONSE_BODY_BYTES,
  executeMockResponse,
  executeMockResponseResult,
  executeMockResponseWithDelay,
  matchRoute,
  MANDATORY_SECURITY_HEADERS,
  PROHIBITED_HOP_BY_HOP_HEADERS,
  resolveScenario,
  ResponseExecutionError,
  type MockApiDefinition,
  type MockScenario,
  type RouteDefinition,
} from '../src/index.js';

describe('Response Executor', () => {
  const baseScenario: MockScenario = {
    id: 'sc-success',
    name: 'Success Response',
    statusCode: 200,
    headers: { 'x-app-version': '1.0.0' },
    body: { success: true, count: 42 },
    delayMs: 25,
  };

  describe('Valid response construction', () => {
    it('constructs a structured mock response from a JSON scenario', () => {
      const response = executeMockResponse(baseScenario);

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-app-version']).toBe('1.0.0');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-length']).toBe(
        String(Buffer.byteLength(JSON.stringify(baseScenario.body))),
      );
      expect(response.body).toBe(JSON.stringify(baseScenario.body));
      expect(response.rawBody).toEqual(baseScenario.body);
      expect(response.delayMs).toBe(25);
      expect(response.byteLength).toBe(Buffer.byteLength(JSON.stringify(baseScenario.body)));
    });

    it('handles string responses with text/plain default content-type', () => {
      const scenario: MockScenario = {
        id: 'sc-text',
        name: 'Plain Text',
        statusCode: 200,
        body: 'Hello, World!',
      };

      const response = executeMockResponse(scenario);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.body).toBe('Hello, World!');
      expect(response.byteLength).toBe(13);
      expect(response.headers['content-length']).toBe('13');
    });

    it('preserves explicitly specified content-type headers', () => {
      const scenario: MockScenario = {
        id: 'sc-xml',
        name: 'XML Response',
        statusCode: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        body: '<response><status>ok</status></response>',
      };

      const response = executeMockResponse(scenario);

      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      expect(response.body).toBe('<response><status>ok</status></response>');
    });

    it('handles binary Uint8Array responses', () => {
      const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const scenario: MockScenario = {
        id: 'sc-binary',
        name: 'Binary Image',
        statusCode: 200,
        body: binaryData,
      };

      const response = executeMockResponse(scenario);

      expect(response.headers['content-type']).toBe('application/octet-stream');
      expect(response.body).toBe(binaryData);
      expect(response.byteLength).toBe(6);
      expect(response.headers['content-length']).toBe('6');
    });

    it('handles null and undefined bodies properly', () => {
      const scenario: MockScenario = {
        id: 'sc-empty',
        name: 'Empty Body',
        statusCode: 200,
        body: null,
      };

      const response = executeMockResponse(scenario);

      expect(response.body).toBeNull();
      expect(response.byteLength).toBe(0);
      expect(response.headers['content-length']).toBe('0');
      expect(response.headers['content-type']).toBeUndefined();
    });

    it('handles 204 No Content with null body without content-length header', () => {
      const scenario: MockScenario = {
        id: 'sc-204',
        name: 'No Content',
        statusCode: 204,
        body: null,
      };

      const response = executeMockResponse(scenario);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBeNull();
      expect(response.headers['content-length']).toBeUndefined();
      expect(response.headers['content-type']).toBeUndefined();
    });

    it('handles 205 Reset Content with null body without content-length header', () => {
      const scenario: MockScenario = {
        id: 'sc-205',
        name: 'Reset Content',
        statusCode: 205,
        headers: { 'x-reset-action': 'clear-form' },
        body: null,
      };

      const response = executeMockResponse(scenario);

      expect(response.statusCode).toBe(205);
      expect(response.body).toBeNull();
      expect(response.headers['content-length']).toBeUndefined();
      expect(response.headers['content-type']).toBeUndefined();
      expect(response.headers['x-reset-action']).toBe('clear-form');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('normalizes header names to lowercase', () => {
      const scenario: MockScenario = {
        id: 'sc-headers',
        name: 'Mixed Case Headers',
        statusCode: 200,
        headers: {
          'X-Custom-Header': 'custom-val',
          'CACHE-CONTROL': 'no-cache',
        },
      };

      const response = executeMockResponse(scenario);

      expect(response.headers['x-custom-header']).toBe('custom-val');
      expect(response.headers['cache-control']).toBe('no-cache');
    });

    it('applies default delayMs: 0 when delayMs is omitted', () => {
      const scenario: MockScenario = {
        id: 'sc-no-delay',
        name: 'No Delay',
        statusCode: 200,
      };

      const response = executeMockResponse(scenario);

      expect(response.delayMs).toBe(0);
    });
  });

  describe('Status code validation', () => {
    it('accepts valid HTTP status codes across all ranges (100-599)', () => {
      for (const code of [100, 200, 201, 204, 205, 301, 304, 400, 404, 500, 503]) {
        const result = executeMockResponseResult({
          id: `sc-${code}`,
          name: `Status ${code}`,
          statusCode: code,
          body: code === 204 || code === 205 || code === 304 || code === 100 ? null : { ok: true },
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.response.statusCode).toBe(code);
        }
      }
    });

    it('rejects status codes below 100', () => {
      const result = executeMockResponseResult({
        id: 'sc-invalid-low',
        name: 'Low Status',
        statusCode: 99,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_CODE');
      }
    });

    it('rejects status codes above 599', () => {
      const result = executeMockResponseResult({
        id: 'sc-invalid-high',
        name: 'High Status',
        statusCode: 600,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_CODE');
      }
    });

    it('rejects non-integer status codes', () => {
      const result = executeMockResponseResult({
        id: 'sc-float',
        name: 'Float Status',
        statusCode: 200.5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_CODE');
      }
    });

    it('rejects non-number status codes', () => {
      const result = executeMockResponseResult({
        id: 'sc-string-status',
        name: 'String Status',
        statusCode: '200' as unknown as number,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_CODE');
      }
    });

    it('rejects 204 No Content with a non-empty body', () => {
      const result = executeMockResponseResult({
        id: 'sc-204-body',
        name: 'Invalid 204',
        statusCode: 204,
        body: { error: 'Should not have body' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_CODE');
        expect(result.error.message).toContain('204');
      }
    });

    it('rejects 205 Reset Content with a non-empty body', () => {
      const resultObj = executeMockResponseResult({
        id: 'sc-205-body-obj',
        name: 'Invalid 205 with Object',
        statusCode: 205,
        body: { error: 'Should not have body' },
      });

      expect(resultObj.success).toBe(false);
      if (!resultObj.success) {
        expect(resultObj.error.code).toBe('INVALID_STATUS_CODE');
        expect(resultObj.error.message).toContain('205');
      }

      const resultStr = executeMockResponseResult({
        id: 'sc-205-body-str',
        name: 'Invalid 205 with String',
        statusCode: 205,
        body: 'non-empty reset payload',
      });

      expect(resultStr.success).toBe(false);
      if (!resultStr.success) {
        expect(resultStr.error.code).toBe('INVALID_STATUS_CODE');
        expect(resultStr.error.message).toContain('205');
      }
    });

    it('rejects 304 Not Modified with a non-empty body', () => {
      const result = executeMockResponseResult({
        id: 'sc-304-body',
        name: 'Invalid 304',
        statusCode: 304,
        body: 'non-empty payload',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_STATUS_CODE');
        expect(result.error.message).toContain('304');
      }
    });
  });

  describe('Header validation and security', () => {
    it('rejects header names with invalid RFC 7230 characters', () => {
      const invalidNames = ['Invalid Header', 'Header:Name', 'Header@Name', ''];

      for (const invalidName of invalidNames) {
        const result = executeMockResponseResult({
          ...baseScenario,
          headers: { [invalidName]: 'value' },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_HEADER_NAME');
        }
      }
    });

    it('rejects header values containing CRLF characters (HTTP response splitting defense)', () => {
      const resultCR = executeMockResponseResult({
        ...baseScenario,
        headers: { 'x-custom': 'line1\r\ninjected-header: bad' },
      });

      expect(resultCR.success).toBe(false);
      if (!resultCR.success) {
        expect(resultCR.error.code).toBe('INVALID_HEADER_VALUE');
      }

      const resultLF = executeMockResponseResult({
        ...baseScenario,
        headers: { 'x-custom': 'line1\ninjected-header: bad' },
      });

      expect(resultLF.success).toBe(false);
      if (!resultLF.success) {
        expect(resultLF.error.code).toBe('INVALID_HEADER_VALUE');
      }
    });

    it('rejects header values containing null bytes', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        headers: { 'x-custom': 'val\0poison' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_HEADER_VALUE');
      }
    });

    it('rejects prohibited hop-by-hop and transport framing headers', () => {
      for (const prohibited of PROHIBITED_HOP_BY_HOP_HEADERS) {
        const result = executeMockResponseResult({
          ...baseScenario,
          headers: { [prohibited]: 'value' },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('PROHIBITED_HEADER');
        }
      }
    });

    it('rejects prohibited headers case-insensitively', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        headers: { 'Transfer-Encoding': 'chunked' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('PROHIBITED_HEADER');
      }
    });

    it('permits valid matching mandatory security headers', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        headers: { 'X-Content-Type-Options': 'nosniff' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.response.headers['x-content-type-options']).toBe('nosniff');
      }
    });

    it('rejects attempts to override mandatory security headers with non-secure values', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        headers: { 'x-content-type-options': 'allow' },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('SECURITY_HEADER_OVERRIDE');
      }
    });

    it('exports PROHIBITED_HOP_BY_HOP_HEADERS and MANDATORY_SECURITY_HEADERS', () => {
      expect(PROHIBITED_HOP_BY_HOP_HEADERS).toContain('connection');
      expect(PROHIBITED_HOP_BY_HOP_HEADERS).toContain('content-length');
      expect(MANDATORY_SECURITY_HEADERS['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('Body size limits and serialization', () => {
    it('calculates multibyte UTF-8 byte length correctly', () => {
      const scenario: MockScenario = {
        id: 'sc-utf8',
        name: 'Multibyte UTF-8',
        statusCode: 200,
        body: '🚀 你好', // 🚀 is 4 bytes, space is 1, 你 is 3, 好 is 3 = 11 bytes
      };

      const response = executeMockResponse(scenario);

      expect(response.byteLength).toBe(11);
      expect(response.headers['content-length']).toBe('11');
    });

    it('permits payloads within the default 1 MiB body size limit', () => {
      const exact1MiBString = 'x'.repeat(DEFAULT_MAX_RESPONSE_BODY_BYTES);
      const scenario: MockScenario = {
        id: 'sc-1mib',
        name: '1 MiB Payload',
        statusCode: 200,
        body: exact1MiBString,
      };

      const response = executeMockResponse(scenario);

      expect(response.byteLength).toBe(DEFAULT_MAX_RESPONSE_BODY_BYTES);
    });

    it('rejects payloads exceeding the 1 MiB body size limit', () => {
      const overLimitString = 'x'.repeat(DEFAULT_MAX_RESPONSE_BODY_BYTES + 1);
      const scenario: MockScenario = {
        id: 'sc-over-1mib',
        name: 'Over Limit Payload',
        statusCode: 200,
        body: overLimitString,
      };

      const result = executeMockResponseResult(scenario);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BODY_SIZE_EXCEEDED');
        expect(result.error.details?.maxBodyBytes).toBe(DEFAULT_MAX_RESPONSE_BODY_BYTES);
      }
    });

    it('respects custom maxBodyBytes configured in options', () => {
      const scenario: MockScenario = {
        id: 'sc-custom-limit',
        name: 'Custom Limit',
        statusCode: 200,
        body: '123456789012345678901', // 21 bytes
      };

      const result = executeMockResponseResult(scenario, { maxBodyBytes: 20 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BODY_SIZE_EXCEEDED');
      }
    });

    it('handles circular references safely without uncaught exceptions', () => {
      interface CircularNode {
        name: string;
        self?: CircularNode;
      }
      const circular: CircularNode = { name: 'loop' };
      circular.self = circular;

      const scenario: MockScenario = {
        id: 'sc-circular',
        name: 'Circular Body',
        statusCode: 200,
        body: circular,
      };

      const result = executeMockResponseResult(scenario);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BODY_SERIALIZATION_FAILED');
      }
    });

    it('handles BigInt serialization errors safely', () => {
      const scenario: MockScenario = {
        id: 'sc-bigint',
        name: 'BigInt Body',
        statusCode: 200,
        body: { num: BigInt(9007199254740991) },
      };

      const result = executeMockResponseResult(scenario);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('BODY_SERIALIZATION_FAILED');
      }
    });
  });

  describe('Artificial delay validation and deterministic execution', () => {
    it('accepts zero and positive delay within the 10-second limit', () => {
      const scenario: MockScenario = {
        id: 'sc-delay-max',
        name: 'Max Delay',
        statusCode: 200,
        delayMs: DEFAULT_MAX_ARTIFICIAL_DELAY_MS,
      };

      const response = executeMockResponse(scenario);
      expect(response.delayMs).toBe(10_000);
    });

    it('rejects negative delays', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        delayMs: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DELAY');
      }
    });

    it('rejects delays exceeding 10,000 ms', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        delayMs: 10_001,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DELAY');
      }
    });

    it('rejects non-integer delays', () => {
      const result = executeMockResponseResult({
        ...baseScenario,
        delayMs: 100.5,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DELAY');
      }
    });

    it('executes delay deterministically with a mock sleeper', async () => {
      const sleeperSpy = vi.fn().mockResolvedValue(undefined);

      const scenario: MockScenario = {
        id: 'sc-timed',
        name: 'Timed Scenario',
        statusCode: 200,
        delayMs: 500,
      };

      const response = await executeMockResponseWithDelay(scenario, {
        sleeper: sleeperSpy,
      });

      expect(sleeperSpy).toHaveBeenCalledTimes(1);
      expect(sleeperSpy).toHaveBeenCalledWith(500);
      expect(response.delayMs).toBe(500);
    });

    it('skips sleeper call when delayMs is 0', async () => {
      const sleeperSpy = vi.fn().mockResolvedValue(undefined);

      const scenario: MockScenario = {
        id: 'sc-no-delay',
        name: 'Instant Scenario',
        statusCode: 200,
        delayMs: 0,
      };

      await executeMockResponseWithDelay(scenario, { sleeper: sleeperSpy });

      expect(sleeperSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error handling and request context', () => {
    it('fails with NO_SCENARIO_PROVIDED when null or undefined is passed', () => {
      const result = executeMockResponseResult(null as unknown as MockScenario);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NO_SCENARIO_PROVIDED');
      }
    });

    it('throws ResponseExecutionError in executeMockResponse on failure', () => {
      expect(() =>
        executeMockResponse({
          id: 'sc-bad',
          name: 'Bad',
          statusCode: 999,
        }),
      ).toThrowError(ResponseExecutionError);

      try {
        executeMockResponse({
          id: 'sc-bad',
          name: 'Bad',
          statusCode: 999,
        });
      } catch (err) {
        expect(err instanceof ResponseExecutionError).toBe(true);
        const typed = err as ResponseExecutionError;
        expect(typed.code).toBe('INVALID_STATUS_CODE');
      }
    });

    it('preserves request context without performing template interpolation', () => {
      const scenario: MockScenario = {
        id: 'sc-static',
        name: 'Static Scenario',
        statusCode: 200,
        body: { template: 'Hello {{name}}', param: ':id' },
      };

      const response = executeMockResponse(scenario, {
        requestContext: {
          method: 'GET',
          path: '/users/123',
          params: { id: '123' },
        },
      });

      // No template interpolation should happen: must remain exact string
      expect(response.body).toBe(JSON.stringify({ template: 'Hello {{name}}', param: ':id' }));
    });
  });

  describe('Integration across Phase 2 milestones (Match -> Resolve -> Execute)', () => {
    interface FullRoute extends RouteDefinition, Omit<MockApiDefinition, 'method' | 'path'> {
      id: string;
      scenarios: MockScenario[];
    }

    it('chains route matching, scenario resolution, and response execution end-to-end', () => {
      const routes: FullRoute[] = [
        {
          id: 'api-checkout',
          method: 'POST',
          path: '/orders/:orderId/checkout',
          defaultScenarioId: 'scenario-paid',
          scenarios: [
            {
              id: 'scenario-paid',
              apiDefinitionId: 'api-checkout',
              name: 'Paid Order',
              statusCode: 200,
              headers: { 'x-payment-status': 'completed' },
              body: { orderId: 'ref', status: 'PAID' },
              delayMs: 10,
            },
            {
              id: 'scenario-declined',
              apiDefinitionId: 'api-checkout',
              name: 'Declined Order',
              statusCode: 402,
              body: { error: 'Insufficient funds' },
              delayMs: 0,
            },
          ],
        },
      ];

      // 1. Route Matcher
      const match = matchRoute('POST', '/orders/999/checkout', routes);
      expect(match).not.toBeNull();
      expect(match?.params).toEqual({ orderId: '999' });

      // 2. Scenario Resolver (Default)
      const resolvedScenario = resolveScenario({
        api: match!.route,
        scenarios: match!.route.scenarios,
      });
      expect(resolvedScenario.id).toBe('scenario-paid');

      // 3. Response Executor
      const response = executeMockResponse(resolvedScenario, {
        requestContext: {
          method: match!.route.method,
          path: '/orders/999/checkout',
          params: match!.params,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-payment-status']).toBe('completed');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.body).toBe(JSON.stringify({ orderId: 'ref', status: 'PAID' }));
      expect(response.delayMs).toBe(10);

      // 4. Scenario Resolver (Explicit override to 402)
      const declinedScenario = resolveScenario({
        api: match!.route,
        scenarios: match!.route.scenarios,
        explicitScenarioName: 'Declined Order',
      });
      const declinedResponse = executeMockResponse(declinedScenario);

      expect(declinedResponse.statusCode).toBe(402);
      expect(declinedResponse.body).toBe(JSON.stringify({ error: 'Insufficient funds' }));
    });
  });
});
