import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('control API health endpoint', () => {
  it('reports healthy', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'control-api' });
    await app.close();
  });
});
