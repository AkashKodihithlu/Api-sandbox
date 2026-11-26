import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { MAX_ARTIFICIAL_DELAY_MS, MAX_RESPONSE_BODY_BYTES } from '@mockflow/contracts';
import type { Database } from '@mockflow/db';
import { createMockEngine } from '@mockflow/mock-engine';
import { createRuntimeStore, type RuntimeStore } from './store.js';

export type RuntimeAppOptions = {
  db?: Database;
  store?: RuntimeStore;
  onClose?: () => Promise<unknown>;
  maxRequestBodyBytes?: number;
  maxResponseBodyBytes?: number;
  maxDelayMs?: number;
};

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

  app.get('/health', async () => ({ status: 'ok' as const, service: 'mock-runtime' }));
  app.get('/ready', async () => ({ status: 'ok' as const, service: 'mock-runtime' }));

  const handleMockRequest = async (request: FastifyRequest, reply: FastifyReply) => {
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

    if (result.status === 'MATCHED') {
      for (const [headerName, headerValue] of Object.entries(result.response.headers)) {
        reply.header(headerName, headerValue);
      }
      if (result.response.body === null) {
        return reply.code(result.response.statusCode).send();
      }
      return reply.code(result.response.statusCode).send(result.response.body);
    }

    if (result.status === 'ROUTE_NOT_FOUND') {
      return sendRuntimeError(reply, 404, 'ROUTE_NOT_FOUND', result.error.message);
    }

    if (result.status === 'REQUEST_VALIDATION_FAILED') {
      if (result.error.code === 'INVALID_REQUEST_SCHEMA') {
        return sendRuntimeError(
          reply,
          500,
          'MOCK_CONFIGURATION_ERROR',
          'Mock endpoint request validation schema is invalid',
        );
      }
      const statusCode = result.error.code === 'REQUEST_BODY_TOO_LARGE' ? 413 : 400;
      return sendRuntimeError(
        reply,
        statusCode,
        result.error.code,
        result.error.message,
        result.error.issues,
      );
    }

    if (result.status === 'SCENARIO_RESOLUTION_FAILED') {
      const statusCode =
        result.error.code === 'INVALID_CONFIGURATION' || result.error.code === 'SCENARIO_MISMATCH'
          ? 422
          : 404;
      return sendRuntimeError(reply, statusCode, result.error.code, result.error.message);
    }

    return sendRuntimeError(
      reply,
      500,
      'MOCK_CONFIGURATION_ERROR',
      'Mock response configuration could not be executed',
    );
  };

  app.all('/p/:projectSlug', handleMockRequest);
  app.all('/p/:projectSlug/*', handleMockRequest);

  return app;
}
