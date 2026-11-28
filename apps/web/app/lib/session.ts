import { ControlPlaneClient, ControlPlaneError } from './control-plane';

export const TOKEN_STORAGE_KEY = 'mockflow.session.token';
export const EMAIL_STORAGE_KEY = 'mockflow.session.email';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionState {
  token: string | null;
  email: string;
}

export function getPasswordMinLength(isRegister: boolean): number {
  return isRegister ? 12 : 1;
}

export function readStoredSession(storage: StorageLike): SessionState {
  const token = storage.getItem(TOKEN_STORAGE_KEY);
  const email = storage.getItem(EMAIL_STORAGE_KEY) ?? '';
  return { token, email };
}

export function writeStoredSession(storage: StorageLike, token: string, email: string): void {
  storage.setItem(TOKEN_STORAGE_KEY, token);
  storage.setItem(EMAIL_STORAGE_KEY, email);
}

export function clearStoredSession(storage: StorageLike): void {
  storage.removeItem(TOKEN_STORAGE_KEY);
  storage.removeItem(EMAIL_STORAGE_KEY);
}

export type SessionValidationResult =
  | { valid: true; email: string }
  | { valid: false; reason: 'unauthorized' | 'error'; message: string };

export async function validateStoredSession(
  client: Pick<ControlPlaneClient, 'me'>,
  storage?: StorageLike,
): Promise<SessionValidationResult> {
  try {
    const user = await client.me();
    return { valid: true, email: user.email };
  } catch (cause) {
    if (cause instanceof ControlPlaneError && cause.status === 401) {
      if (storage) {
        clearStoredSession(storage);
      }
      return {
        valid: false,
        reason: 'unauthorized',
        message: 'Your session has expired. Please sign in again.',
      };
    }
    return {
      valid: false,
      reason: 'error',
      message:
        cause instanceof ControlPlaneError
          ? cause.message
          : 'Could not verify your session with the control plane.',
    };
  }
}
