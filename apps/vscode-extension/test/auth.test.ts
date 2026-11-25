import { describe, expect, it } from 'vitest';
import {
  AuthenticationService,
  TOKEN_SECRET_KEY,
  USER_SECRET_KEY,
  type SecretStore,
} from '../src/auth.js';
import { ControlPlaneClient } from '../src/client.js';

class MemorySecrets implements SecretStore {
  readonly values = new Map<string, string>();
  get(key: string) {
    return Promise.resolve(this.values.get(key));
  }
  store(key: string, value: string) {
    this.values.set(key, value);
    return Promise.resolve();
  }
  delete(key: string) {
    this.values.delete(key);
    return Promise.resolve();
  }
}

describe('AuthenticationService', () => {
  it('stores only the session token and user in secret storage', async () => {
    const secrets = new MemorySecrets();
    const client = new ControlPlaneClient(
      'https://mockflow.test',
      async () => undefined,
      async () =>
        new Response(
          JSON.stringify({
            data: { token: 'token-value', user: { id: 'u1', email: 'dev@example.test' } },
          }),
          { status: 200 },
        ),
    );
    const auth = new AuthenticationService(secrets);

    await auth.signIn(client, 'dev@example.test', 'not-stored-password');

    expect(secrets.values.get(TOKEN_SECRET_KEY)).toBe('token-value');
    expect(secrets.values.get(USER_SECRET_KEY)).toContain('dev@example.test');
    expect([...secrets.values.values()].join()).not.toContain('not-stored-password');
  });

  it('removes stored session data on sign out', async () => {
    const secrets = new MemorySecrets();
    const auth = new AuthenticationService(secrets);
    await secrets.store(TOKEN_SECRET_KEY, 'token');
    await secrets.store(USER_SECRET_KEY, '{"id":"u1","email":"dev@example.test"}');

    await auth.signOut();

    expect(secrets.values.size).toBe(0);
  });
});
