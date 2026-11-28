import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlPlaneClient, ControlPlaneError } from '../app/lib/control-plane';
import {
  clearStoredSession,
  EMAIL_STORAGE_KEY,
  getPasswordMinLength,
  readStoredSession,
  TOKEN_STORAGE_KEY,
  validateStoredSession,
  writeStoredSession,
  type StorageLike,
} from '../app/lib/session';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('Priority 1 authentication & session stability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses minLength 1 for sign-in and minLength 12 for registration', () => {
    expect(getPasswordMinLength(false)).toBe(1);
    expect(getPasswordMinLength(true)).toBe(12);
  });

  it('allows sign-in with passwords shorter than 12 characters', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { token: 'jwt-123', user: { email: 'user@example.test', displayName: 'User' } },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ControlPlaneClient();
    const session = await client.signIn('user@example.test', 'shortpw');

    expect(session.token).toBe('jwt-123');
    expect(fetchMock).toHaveBeenCalledWith(
      '/control/v1/auth/session',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.test', password: 'shortpw' }),
      }),
    );
  });

  it('validates active session via GET /v1/auth/me', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { id: 'u1', email: 'me@example.test' } }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const storage = new MemoryStorage();
    writeStoredSession(storage, 'valid-jwt', 'old@example.test');
    const result = await validateStoredSession(new ControlPlaneClient('valid-jwt'), storage);

    expect(result).toEqual({ valid: true, email: 'me@example.test' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/control/v1/auth/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(readStoredSession(storage).token).toBe('valid-jwt');
  });

  it('clears stored session when GET /v1/auth/me returns 401', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'AUTH_REQUIRED', message: 'Authentication is required' },
          }),
          { status: 401 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const storage = new MemoryStorage();
    writeStoredSession(storage, 'expired-jwt', 'user@example.test');

    const result = await validateStoredSession(new ControlPlaneClient('expired-jwt'), storage);
    expect(result).toEqual({
      valid: false,
      reason: 'unauthorized',
      message: 'Your session has expired. Please sign in again.',
    });
    expect(storage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(EMAIL_STORAGE_KEY)).toBeNull();
  });

  it('throws 401 ControlPlaneError on me() and clears storage on sign-out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Authentication is required' } }), {
            status: 401,
          }),
      ),
    );

    const client = new ControlPlaneClient('bad-token');
    await expect(client.me()).rejects.toMatchObject({
      status: 401,
      message: 'Authentication is required',
    } satisfies Partial<ControlPlaneError>);

    const storage = new MemoryStorage();
    writeStoredSession(storage, 'tok', 'a@b.test');
    clearStoredSession(storage);
    expect(readStoredSession(storage)).toEqual({ token: null, email: '' });
  });
});
