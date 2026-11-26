import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { MAX_ARTIFICIAL_DELAY_MS, MAX_RESPONSE_BODY_BYTES } from '@mockflow/contracts';
import type { Database } from '@mockflow/db';
import { createMockEngine } from '@mockflow/mock-engine';
import { createRuntimeStore, type RequestLogEntry, type RuntimeStore } from './store.js';

export type RuntimeAppOptions = {
  db?: Database;
  store?: RuntimeStore;
  onClose?: () => Promise<unknown>;
  maxRequestBodyBytes?: number;
  maxResponseBodyBytes?: number;
  maxDelayMs?: number;
};

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-csrf-token',
  'x-xsrf-token',
]);

const SENSITIVE_HEADER_PATTERN =
  /(authorization|cookie|token|secret|password|credential|api[-_]?key)/i;
const MAX_LOGGED_HEADERS = 50;
const MAX_LOGGED_HEADER_VALUE_LENGTH = 512;

function sendRuntimeError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details: unknown[] = [],
) {
  return reply.code(statusCode).send({
    error: { code, message, details },
  });
}

function normalizeRequestHeaders(headers: FastifyRequest['headers']): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value;
    } else if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(', ');
    }
  }
  return normalized;
}

export function redactRequestHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  let count = 0;

  for (const [rawKey, value] of Object.entries(headers)) {
    if (count >= MAX_LOGGED_HEADERS) {
      break;
    }
    const key = rawKey.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(key) || SENSITIVE_HEADER_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] =
        value.length > MAX_LOGGED_HEADER_VALUE_LENGTH
          ? `${value.slice(0, MAX_LOGGED_HEADER_VALUE_LENGTH)}...[truncated]`
          : value;
    }
    count += 1;
  }

  return redacted;
}

function estimateRequestBytes(headers: Record<string, string>, body: unknown): number {
  const contentLength = headers['content-length'];
  if (contentLength) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }
  if (body === undefined || body === null) {
    return 0;
  }
  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf8');
  }
  if (body instanceof Uint8Array) {
    return body.byteLength;
  }
  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return 0;
  }
}

function extractRoutePath(wildcard: string | undefined): string {
  const cleaned = (wildcard ?? '').replace(/^\/+/, '');
  return cleaned.length > 0 ? `/${cleaned}` : '/';
}

export function buildApp(options: RuntimeAppOptions = {}) {
  const maxRequestBodyBytes = options.maxRequestBodyBytes ?? MAX_RESPONSE_BODY_BYTES;
  const maxResponseBodyBytes = options.maxResponseBodyBytes ?? MAX_RESPONSE_BODY_BYTES;
  const maxDelayMs = options.maxDelayMs ?? MAX_ARTIFICIAL_DELAY_MS;
  const store = options.store ?? (options.db ? createRuntimeStore(options.db) : undefined);

  const app = Fastify({
    logger: false,
    bodyLimit: maxRequestBodyBytes,
    requestTimeout: maxDelayMs + 5_000,
  });

  if (options.onClose) {
    app.addHook('onClose', options.onClose);
  }

  app.setNotFoundHandler((_request, reply) => {
    return sendRuntimeError(reply, 404, 'ROUTE_NOT_FOUND', 'Route not found');
  });

  app.setErrorHandler((error, _request, reply) => {
    const fastifyError = error as { code?: string; statusCode?: number };
    if (fastifyError?.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || fastifyError?.statusCode === 413) {
      return sendRuntimeError(
        reply,
        413,
        'PAYLOAD_TOO_LARGE',
        'Request body exceeds the maximum allowed size',
      );
    }

    if (
      fastifyError?.code === 'FST_ERR_CTP_INVALID_JSON' ||
      fastifyError?.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
      fastifyError?.statusCode === 400
    ) {
      return sendRuntimeError(reply, 400, 'INVALID_REQUEST_BODY', 'Malformed request body');
    }

    app.log.error(error);
    return sendRuntimeError(reply, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  app.get('/health', async () => ({ status: 'ok' as const, service: 'mock-runtime' }));
  app.get('/ready', async () => ({ status: 'ok' as const, service: 'mock-runtime' }));

  const safeRecordLog = async (entry: RequestLogEntry) => {
    if (!store) return;
    try {
      await store.recordRequestLog(entry);
    } catch (error) {
      app.log.error(error);
    }
  };

  const handleMockRequest = async (request: FastifyRequest, reply: FastifyReply) => {
    const startedAt = performance.now();

    if (!store) {
      return sendRuntimeError(
        reply,
        503,
        'RUNTIME_UNAVAILABLE',
        'Runtime data store is not configured',
      );
    }

    const params = request.params as { projectSlug?: string; '*'?: string };
    const projectSlug = params.projectSlug ?? '';
    const project = await store.findActiveProjectBySlug(projectSlug);
    if (!project) {
      return sendRuntimeError(
        reply,
        404,
        'PROJECT_NOT_FOUND',
        'Project does not exist or is unavailable',
      );
    }

    const routes = await store.loadPublishedRoutesForProject(project.id);
    const routePath = extractRoutePath(params['*']);
    const normalizedHeaders = normalizeRequestHeaders(request.headers);
    const redactedHeaders = redactRequestHeaders(normalizedHeaders);
    const requestBytes = estimateRequestBytes(normalizedHeaders, request.body);

    const environmentKey =
      normalizedHeaders['x-mockflow-environment'] ?? normalizedHeaders['x-mockflow-environment-id'];
    const resolvedEnvironment = environmentKey
      ? await store.resolveEnvironment(project.id, environmentKey)
      : null;

    const engine = createMockEngine({
      routes,
      maxBodyBytes: maxResponseBodyBytes,
      maxDelayMs,
      requestValidation: { maxBodyBytes: maxRequestBodyBytes },
    });

    const result = await engine.executeWithDelay(
      {
        method: request.method,
        path: routePath,
        query:
          request.query && typeof request.query === 'object'
            ? (request.query as Record<string, unknown>)
            : undefined,
        headers: normalizedHeaders,
        body: request.body,
        environmentId: resolvedEnvironment?.id ?? null,
      },
      {
        environmentScenarios: resolvedEnvironment?.scenarios ?? null,
      },
    );

    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));

    if (result.status === 'MATCHED') {
      await safeRecordLog({
        projectId: project.id,
        apiDefinitionId: result.route.id,
        scenarioId: result.scenario.id,
        method: request.method,
        path: routePath,
        statusCode: result.response.statusCode,
        durationMs,
        requestBytes,
        responseBytes: result.response.byteLength,
        redactedHeaders,
      });

      for (const [headerName, headerValue] of Object.entries(result.response.headers)) {
        reply.header(headerName, headerValue);
      }
      if (result.response.body === null) {
        return reply.code(result.response.statusCode).send();
      }
      return reply.code(result.response.statusCode).send(result.response.body);
    }

    let errorStatus = 500;
    let errorCode = 'MOCK_CONFIGURATION_ERROR';
    let errorMessage = 'Mock response configuration could not be executed';
    let errorDetails: unknown[] = [];

    if (result.status === 'ROUTE_NOT_FOUND') {
      errorStatus = 404;
      errorCode = 'ROUTE_NOT_FOUND';
      errorMessage = result.error.message;
    } else if (result.status === 'REQUEST_VALIDATION_FAILED') {
      if (result.error.code === 'INVALID_REQUEST_SCHEMA') {
        errorStatus = 500;
        errorCode = 'MOCK_CONFIGURATION_ERROR';
        errorMessage = 'Mock endpoint request validation schema is invalid';
      } else {
        errorStatus = result.error.code === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400;
        errorCode = result.error.code;
        errorMessage = result.error.message;
        errorDetails = result.error.issues;
      }
    } else if (result.status === 'SCENARIO_RESOLUTION_FAILED') {
      errorStatus =
        result.error.code === 'INVALID_CONFIGURATION' || result.error.code === 'SCENARIO_MISMATCH'
          ? 422
          : 404;
      errorCode = result.error.code;
      errorMessage = result.error.message;
    }

    const responseBytes = Buffer.byteLength(
      JSON.stringify({
        error: { code: errorCode, message: errorMessage, details: errorDetails },
      }),
      'utf8',
    );

    await safeRecordLog({
      projectId: project.id,
      apiDefinitionId: result.matched ? result.route.id : null,
      scenarioId: result.status === 'RESPONSE_EXECUTION_FAILED' ? result.scenario.id : null,
      method: request.method,
      path: routePath,
      statusCode: errorStatus,
      durationMs,
      requestBytes,
      responseBytes,
      redactedHeaders,
    });

    return sendRuntimeError(reply, errorStatus, errorCode, errorMessage, errorDetails);
  };

  app.all('/p/:projectSlug', handleMockRequest);
  app.all('/p/:projectSlug/*', handleMockRequest);

  return app;
}
