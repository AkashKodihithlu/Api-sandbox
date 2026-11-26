import { describe, expect, it } from 'vitest';
import { ControlPlaneClient, ControlPlaneError } from '../src/client.js';

describe('ControlPlaneClient', () => {
  it('sends a bearer token and returns typed response data', async () => {
    let authorization = '';
    const client = new ControlPlaneClient(
      'https://mockflow.test',
      async () => 'secret-token',
      async (_input, init) => {
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'p1',
                name: 'Demo',
                slug: 'demo',
                status: 'ACTIVE',
                role: 'OWNER',
                description: null,
              },
            ],
          }),
          { status: 200 },
        );
      },
    );

    await expect(client.listProjects()).resolves.toHaveLength(1);
    expect(authorization).toBe('Bearer secret-token');
  });

  it('returns a safe error for an unavailable API', async () => {
    const client = new ControlPlaneClient(
      'https://mockflow.test',
      async () => 'secret-token',
      async () => {
        throw new Error('offline');
      },
    );

    const expectedError: Partial<ControlPlaneError> = {
      code: 'NETWORK_ERROR',
      status: 0,
    };
    await expect(client.listProjects()).rejects.toMatchObject(expectedError);
  });

  it('supports publishing, unpublishing, scenario creation, and 204 delete responses', async () => {
    const requests: Array<{ method: string; url: string; body?: string }> = [];
    const client = new ControlPlaneClient(
      'https://mockflow.test',
      async () => 'secret-token',
      async (input, init) => {
        requests.push({
          method: init?.method ?? 'GET',
          url: String(input),
          body: typeof init?.body === 'string' ? init.body : undefined,
        });
        if (init?.method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        if (String(input).endsWith('/scenarios')) {
          return new Response(
            JSON.stringify({ data: { id: 's1', name: 'Ok', statusCode: 200, isDefault: true } }),
            { status: 201 },
          );
        }
        return new Response(
          JSON.stringify({
            data: { id: 'a1', name: 'Users', method: 'GET', path: '/users', isPublished: true },
          }),
          { status: 200 },
        );
      },
    );

    const published = await client.updateApi('a1', { isPublished: true });
    expect(published.isPublished).toBe(true);

    const scenario = await client.createScenario('a1', {
      name: 'Ok',
      statusCode: 200,
      isDefault: true,
    });
    expect(scenario.id).toBe('s1');

    await expect(client.deleteApi('a1')).resolves.toBeUndefined();
    expect(requests.map((r) => r.method)).toEqual(['PATCH', 'POST', 'DELETE']);
  });
});
