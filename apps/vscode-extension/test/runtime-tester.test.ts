import { describe, expect, it } from 'vitest';
import {
  buildHostedEndpointUrl,
  RuntimeTestError,
  testPublishedEndpoint,
} from '../src/runtime-tester.js';

describe('Phase 6 runtime URL & endpoint tester', () => {
  it('builds normalized hosted runtime URLs', () => {
    expect(buildHostedEndpointUrl('http://localhost:4001/', 'demo-app', '/v1/users/')).toBe(
      'http://localhost:4001/p/demo-app/v1/users',
    );
    expect(buildHostedEndpointUrl('https://mock.example.test', 'my slug', 'orders')).toBe(
      'https://mock.example.test/p/my%20slug/orders',
    );
  });

  it('executes test requests with optional scenario override and returns formatted result', async () => {
    let capturedUrl = '';
    let capturedScenarioHeader = '';
    const result = await testPublishedEndpoint({
      runtimeBaseUrl: 'http://localhost:4001',
      projectSlug: 'demo',
      method: 'POST',
      path: '/orders',
      body: { item: 'book' },
      scenarioName: 'Created',
      fetcher: async (input, init) => {
        capturedUrl = String(input);
        capturedScenarioHeader = new Headers(init?.headers).get('x-mockflow-scenario-name') ?? '';
        return new Response(JSON.stringify({ id: 'ord-1' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    expect(capturedUrl).toBe('http://localhost:4001/p/demo/orders');
    expect(capturedScenarioHeader).toBe('Created');
    expect(result.statusCode).toBe(201);
    expect(result.bodyText).toBe('{"id":"ord-1"}');
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('wraps network failures in RuntimeTestError', async () => {
    await expect(
      testPublishedEndpoint({
        runtimeBaseUrl: 'http://localhost:4001',
        projectSlug: 'demo',
        method: 'GET',
        path: '/orders',
        fetcher: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    ).rejects.toBeInstanceOf(RuntimeTestError);
  });
});
