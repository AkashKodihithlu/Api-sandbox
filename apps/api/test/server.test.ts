import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

describe('control API server startup and shutdown', () => {
  it('registers onClose hook before listening and invokes it on close', async () => {
    const onClose = vi.fn().mockResolvedValue(undefined);
    const app = buildApp({ onClose });

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(onClose).not.toHaveBeenCalled();

    await app.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
