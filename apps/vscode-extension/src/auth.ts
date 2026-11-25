import { ControlPlaneClient, type AuthenticatedUser, type SessionResponse } from './client.js';

export const TOKEN_SECRET_KEY = 'mockflow.session.token';
export const USER_SECRET_KEY = 'mockflow.session.user';

export interface SecretStore {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
  delete(key: string): PromiseLike<void>;
}

export class AuthenticationService {
  constructor(private readonly secrets: SecretStore) {}

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(TOKEN_SECRET_KEY);
  }

  async getUser(): Promise<AuthenticatedUser | undefined> {
    const raw = await this.secrets.get(USER_SECRET_KEY);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as AuthenticatedUser;
    } catch {
      await this.secrets.delete(USER_SECRET_KEY);
      return undefined;
    }
  }

  async signIn(
    client: ControlPlaneClient,
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const session: SessionResponse = await client.createSession(email, password);
    await this.secrets.store(TOKEN_SECRET_KEY, session.token);
    await this.secrets.store(USER_SECRET_KEY, JSON.stringify(session.user));
    return session.user;
  }

  async signOut(): Promise<void> {
    await Promise.all([
      this.secrets.delete(TOKEN_SECRET_KEY),
      this.secrets.delete(USER_SECRET_KEY),
    ]);
  }
}
