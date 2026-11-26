import { describe, expect, it, vi } from 'vitest';
import type { MockEngineRoute } from '@mockflow/mock-engine';
import { buildApp, redactRequestHeaders } from '../src/app.js';
import type { ActiveProject, RuntimeStore } from '../src/store.js';

const baseRoute: MockEngineRoute = {
  id: 'api-1',
  projectId: 'proj-1',
  name: 'Ping',
  method: 'POST',
  path: '/ping',
  defaultScenarioId: 'scen-1',
  isPublished: true,
  scenarios: [
    {
      id: 'scen-1',
      apiDefinitionId: 'api-1',
      projectId: 'proj-1',
      name: 'Ok',
      type: 'SUCCESS',
      statusCode: 200,
      headers: {},
      body: { pong: true },
      delayMs: 0,
      isDefault: true,
    },
  ],
};

describe('runtime safeguards, logging, redaction, and error handling', () => {
  it('redacts sensitive headers and preserves safe headers', () => {
    const redacted = redactRequestHeaders({
      authorization: 'Bearer super-secret-jwt',
      cookie: 'session=abc123',
      'x-api-key': 'mk_live_123',
      'x-custom-token': 'tok_456',
      'x-request-id': 'req-789',
    });

    expect(redacted).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'x-api-key': '[REDACTED]',
      'x-custom-token': '[REDACTED]',
      'x-request-id': 'req-789',
    });
  });

  it('records request logs with redacted headers and does not fail if logging throws', async () => {
    const recordRequestLog = vi.fn(async () => {
      throw new Error('log table unavailable');
    });
    const project: ActiveProject = { id: 'proj-1', slug: 'demo', name: 'Demo' };
    const store: RuntimeStore = {
      findActiveProjectBySlug: vi.fn(async () => project),
      loadPublishedRoutesForProject: vi.fn(async () => [baseRoute]),
      resolveEnvironment: vi.fn(async () => null),
      recordRequestLog,
    };

    const app = buildApp({ store });
    const response = await app.inject({
      method: 'POST',
      url: '/p/demo/ping',
      headers: {
        authorization: 'Bearer top-secret',
        'x-trace': 'trace-1',
      },
      payload: { hello: 'world' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pong: true });
    expect(recordRequestLog).toHaveBeenCalledTimes(1);
    expect(recordRequestLog).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        apiDefinitionId: 'api-1',
        scenarioId: 'scen-1',
        method: 'POST',
        path: '/ping',
        statusCode: 200,
        redactedHeaders: expect.objectContaining({
          authorization: '[REDACTED]',
          'x-trace': 'trace-1',
        }),
      }),
    );
  });

  it('enforces request body size limit and handles malformed JSON safely', async () => {
    const store: RuntimeStore = {
      findActiveProjectBySlug: vi.fn(async () => ({ id: 'proj-1', slug: 'demo', name: 'Demo' })),
      loadPublishedRoutesForProject: vi.fn(async () => [baseRoute]),
      resolveEnvironment: vi.fn(async () => null),
      recordRequestLog: vi.fn(async () => undefined),
    };
    const app = buildApp({ store, maxRequestBodyBytes: 64 });

    const oversized = await app.inject({
      method: 'POST',
      url: '/p/demo/ping',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ data: 'x'.repeat(200) }),
    });
    expect(oversized.statusCode).toBe(413);
    expect(oversized.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });

    const malformed = await app.inject({
      method: 'POST',
      url: '/p/demo/ping',
      headers: { 'content-type': 'application/json' },
      payload: '{bad json',
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: 'INVALID_REQUEST_BODY' } });
  });

  it('enforces bounded artificial delay and rejects excessive configured delays', async () => {
    const delayedRoute: MockEngineRoute = {
      ...baseRoute,
      scenarios: [
        { ...baseRoute.scenarios[0], id: 'scen-fast', delayMs: 25, isDefault: true },
        {
          ...baseRoute.scenarios[0],
          id: 'scen-too-slow',
          name: 'TooSlow',
          delayMs: 500,
          isDefault: false,
        },
      ],
      defaultScenarioId: 'scen-fast',
    };
    const store: RuntimeStore = {
      findActiveProjectBySlug: vi.fn(async () => ({ id: 'proj-1', slug: 'demo', name: 'Demo' })),
      loadPublishedRoutesForProject: vi.fn(async () => [delayedRoute]),
      resolveEnvironment: vi.fn(async () => null),
      recordRequestLog: vi.fn(async () => undefined),
    };
    const app = buildApp({ store, maxDelayMs: 100 });

    const ok = await app.inject({ method: 'POST', url: '/p/demo/ping' });
    expect(ok.statusCode).toBe(200);

    const tooSlow = await app.inject({
      method: 'POST',
      url: '/p/demo/ping',
      headers: { 'x-mockflow-scenario-name': 'TooSlow' },
    });
    expect(tooSlow.statusCode).toBe(500);
    expect(tooSlow.json()).toMatchObject({ error: { code: 'MOCK_CONFIGURATION_ERROR' } });
  });

  it('handles database errors safely without leaking internal details', async () => {
    const store: RuntimeStore = {
      findActiveProjectBySlug: vi.fn(async () => {
        throw new Error('ECONNREFUSED postgresql://mockflow:secret@db:5432/mockflow');
      }),
      loadPublishedRoutesForProject: vi.fn(async () => []),
      resolveEnvironment: vi.fn(async () => null),
      recordRequestLog: vi.fn(async () => undefined),
    };
    const app = buildApp({ store });

    const res = await app.inject({ method: 'GET', url: '/p/demo/ping' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: [],
      },
    });
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('postgresql://');
  });
});
