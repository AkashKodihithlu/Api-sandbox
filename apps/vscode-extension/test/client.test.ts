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

    await expect(client.listProjects()).rejects.toMatchObject<Partial<ControlPlaneError>>({
      code: 'NETWORK_ERROR',
      status: 0,
    });
  });
});
