import type { MockScenario } from './scenario-resolver.js';

export const DEFAULT_MAX_RESPONSE_BODY_BYTES = 1_048_576; // 1 MiB (1024 * 1024)
export const DEFAULT_MAX_ARTIFICIAL_DELAY_MS = 10_000; // 10 seconds

/**
 * Hop-by-hop and transport framing headers prohibited in mock responses
 * according to RFC 7230, RFC 2616, and secure HTTP framing rules.
 */
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

export type ProhibitedHeader = (typeof PROHIBITED_HOP_BY_HOP_HEADERS)[number];

/**
 * Mandatory security headers applied to all mock responses to prevent MIME-sniffing
 * and related client vulnerabilities.
 */
export const MANDATORY_SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
};

// RFC 7230 Section 3.2.6 token character set
const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type ResponseExecutionErrorCode =
  | 'NO_SCENARIO_PROVIDED'
  | 'INVALID_STATUS_CODE'
  | 'INVALID_HEADER_NAME'
  | 'INVALID_HEADER_VALUE'
  | 'PROHIBITED_HEADER'
  | 'SECURITY_HEADER_OVERRIDE'
  | 'BODY_SERIALIZATION_FAILED'
  | 'BODY_SIZE_EXCEEDED'
  | 'INVALID_DELAY';

export class ResponseExecutionError extends Error {
  readonly code: ResponseExecutionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ResponseExecutionErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ResponseExecutionError';
    this.code = code;
    this.details = details;
  }
}

export interface RequestContext {
  method?: string;
  path?: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ExecuteResponseOptions {
  /**
   * Optional incoming request context.
   */
  requestContext?: RequestContext;

  /**
   * Maximum response body bytes allowed. Defaults to 1 MiB (1,048,576 bytes).
   */
  maxBodyBytes?: number;

  /**
   * Maximum allowed artificial delay in milliseconds. Defaults to 10,000 ms.
   */
  maxDelayMs?: number;
}

export interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string | Uint8Array | null;
  rawBody: unknown;
  delayMs: number;
  byteLength: number;
}

export interface ResponseExecutionSuccess {
  success: true;
  response: MockResponse;
}

export interface ResponseExecutionFailure {
  success: false;
  error: {
    code: ResponseExecutionErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ResponseExecutionResult = ResponseExecutionSuccess | ResponseExecutionFailure;

/**
 * Validates and transforms a resolved scenario into a structured, framework-independent
 * mock response payload.
 *
 * Enforces status code validation, hop-by-hop header blocking, mandatory security headers,
 * 1 MiB body size limits, safe JSON serialization, and artificial delay boundaries.
 */
export function executeMockResponseResult(
  scenario: MockScenario,
  options?: ExecuteResponseOptions,
): ResponseExecutionResult {
  if (!scenario || typeof scenario !== 'object') {
    return {
      success: false,
      error: {
        code: 'NO_SCENARIO_PROVIDED',
        message: 'No scenario provided for response execution.',
      },
    };
  }

  // 1. Status Code Validation
  const statusCode = scenario.statusCode;
  if (
    typeof statusCode !== 'number' ||
    !Number.isInteger(statusCode) ||
    statusCode < 100 ||
    statusCode > 599
  ) {
    return {
      success: false,
      error: {
        code: 'INVALID_STATUS_CODE',
        message: `Invalid status code ${statusCode}. Must be an integer between 100 and 599.`,
        details: { statusCode },
      },
    };
  }

  // Check status codes that forbid a response body (204 No Content, 205 Reset Content, 304 Not Modified, 1xx Informational)
  const isNoBodyStatus =
    statusCode === 204 ||
    statusCode === 205 ||
    statusCode === 304 ||
    (statusCode >= 100 && statusCode < 200);

  if (isNoBodyStatus) {
    const hasBody =
      scenario.body !== null &&
      scenario.body !== undefined &&
      (typeof scenario.body !== 'string' || scenario.body.length > 0);

    if (hasBody) {
      return {
        success: false,
        error: {
          code: 'INVALID_STATUS_CODE',
          message: `Response status code ${statusCode} must not include a response body.`,
          details: { statusCode },
        },
      };
    }
  }

  // 2. Delay Validation
  const delayMs = scenario.delayMs ?? 0;
  const maxDelayMs = options?.maxDelayMs ?? DEFAULT_MAX_ARTIFICIAL_DELAY_MS;

  if (typeof delayMs !== 'number' || !Number.isInteger(delayMs) || delayMs < 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_DELAY',
        message: `Invalid artificial delay ${delayMs}. Must be a non-negative integer.`,
        details: { delayMs },
      },
    };
  }

  if (delayMs > maxDelayMs) {
    return {
      success: false,
      error: {
        code: 'INVALID_DELAY',
        message: `Artificial delay (${delayMs} ms) exceeds the maximum allowed limit of ${maxDelayMs} ms.`,
        details: { delayMs, maxDelayMs },
      },
    };
  }

  // 3. Body Serialization and Size Validation
  let serializedBody: string | Uint8Array | null = null;
  let defaultContentType: string | null = null;

  if (scenario.body === null || scenario.body === undefined || isNoBodyStatus) {
    serializedBody = null;
  } else if (typeof scenario.body === 'string') {
    serializedBody = scenario.body;
    defaultContentType = 'text/plain; charset=utf-8';
  } else if (scenario.body instanceof Uint8Array) {
    serializedBody = scenario.body;
    defaultContentType = 'application/octet-stream';
  } else {
    try {
      serializedBody = JSON.stringify(scenario.body);
      defaultContentType = 'application/json; charset=utf-8';
    } catch (serializationError) {
      const message =
        serializationError instanceof Error
          ? serializationError.message
          : 'Unable to serialize body to JSON';
      return {
        success: false,
        error: {
          code: 'BODY_SERIALIZATION_FAILED',
          message: `Failed to serialize scenario body: ${message}`,
        },
      };
    }
  }

  let byteLength = 0;
  if (serializedBody !== null) {
    if (typeof serializedBody === 'string') {
      byteLength = Buffer.byteLength(serializedBody, 'utf8');
    } else {
      byteLength = serializedBody.byteLength;
    }
  }

  const maxBodyBytes = options?.maxBodyBytes ?? DEFAULT_MAX_RESPONSE_BODY_BYTES;
  if (byteLength > maxBodyBytes) {
    return {
      success: false,
      error: {
        code: 'BODY_SIZE_EXCEEDED',
        message: `Response body size (${byteLength} bytes) exceeds maximum limit of ${maxBodyBytes} bytes.`,
        details: { byteLength, maxBodyBytes },
      },
    };
  }

  // 4. Header Validation and Normalization
  const normalizedHeaders: Record<string, string> = {};

  if (scenario.headers && typeof scenario.headers === 'object') {
    for (const [rawKey, rawValue] of Object.entries(scenario.headers)) {
      if (!rawKey || !HEADER_NAME_REGEX.test(rawKey)) {
        return {
          success: false,
          error: {
            code: 'INVALID_HEADER_NAME',
            message: `Invalid header name "${rawKey}". Header names must be valid RFC 7230 tokens.`,
            details: { headerName: rawKey },
          },
        };
      }

      const lowerKey = rawKey.toLowerCase();

      if (PROHIBITED_HOP_BY_HOP_HEADERS.includes(lowerKey as ProhibitedHeader)) {
        return {
          success: false,
          error: {
            code: 'PROHIBITED_HEADER',
            message: `Header "${rawKey}" is a prohibited hop-by-hop or framing header.`,
            details: { headerName: rawKey },
          },
        };
      }

      if (typeof rawValue !== 'string') {
        return {
          success: false,
          error: {
            code: 'INVALID_HEADER_VALUE',
            message: `Header value for "${rawKey}" must be a string.`,
            details: { headerName: rawKey },
          },
        };
      }

      if (rawValue.includes('\r') || rawValue.includes('\n') || rawValue.includes('\0')) {
        return {
          success: false,
          error: {
            code: 'INVALID_HEADER_VALUE',
            message: `Header value for "${rawKey}" contains prohibited control characters (CRLF/null).`,
            details: { headerName: rawKey },
          },
        };
      }

      // Check mandatory security header overrides
      if (MANDATORY_SECURITY_HEADERS[lowerKey]) {
        const expectedValue = MANDATORY_SECURITY_HEADERS[lowerKey];
        if (rawValue.trim().toLowerCase() !== expectedValue) {
          return {
            success: false,
            error: {
              code: 'SECURITY_HEADER_OVERRIDE',
              message: `Configured header "${rawKey}: ${rawValue}" cannot override mandatory security header "${lowerKey}: ${expectedValue}".`,
              details: {
                headerName: lowerKey,
                attemptedValue: rawValue,
                requiredValue: expectedValue,
              },
            },
          };
        }
      }

      normalizedHeaders[lowerKey] = rawValue;
    }
  }

  // Enforce mandatory security headers
  for (const [secKey, secValue] of Object.entries(MANDATORY_SECURITY_HEADERS)) {
    if (!normalizedHeaders[secKey]) {
      normalizedHeaders[secKey] = secValue;
    }
  }

  // Set default content-type if not already specified and body exists
  if (defaultContentType && !normalizedHeaders['content-type']) {
    normalizedHeaders['content-type'] = defaultContentType;
  }

  // Set Content-Length header for statuses where content length is valid
  if (!isNoBodyStatus) {
    normalizedHeaders['content-length'] = String(byteLength);
  }

  return {
    success: true,
    response: {
      statusCode,
      headers: normalizedHeaders,
      body: serializedBody,
      rawBody: scenario.body ?? null,
      delayMs,
      byteLength,
    },
  };
}

/**
 * Validates and transforms a resolved scenario into a mock response, throwing
 * ResponseExecutionError if validation or execution fails.
 */
export function executeMockResponse(
  scenario: MockScenario,
  options?: ExecuteResponseOptions,
): MockResponse {
  const result = executeMockResponseResult(scenario, options);
  if (!result.success) {
    throw new ResponseExecutionError(result.error.code, result.error.message, result.error.details);
  }
  return result.response;
}

/**
 * Validates and executes a mock response, applying artificial delay asynchronously.
 * Supports a custom `sleeper` function for deterministic testing.
 */
export async function executeMockResponseWithDelay(
  scenario: MockScenario,
  options?: ExecuteResponseOptions & {
    sleeper?: (ms: number) => Promise<void>;
  },
): Promise<MockResponse> {
  const response = executeMockResponse(scenario, options);

  if (response.delayMs > 0) {
    if (options?.sleeper) {
      await options.sleeper(response.delayMs);
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, response.delayMs));
    }
  }

  return response;
}
