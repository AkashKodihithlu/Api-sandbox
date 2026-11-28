'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ControlPlaneClient } from '../lib/control-plane';
import {
  clearStoredSession,
  readStoredSession,
  validateStoredSession,
  writeStoredSession,
} from '../lib/session';

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  token: string | null;
  email: string;
  sessionError: string | null;
  sessionNotice: string | null;
  hasStoredCredentials: boolean;
  completeAuth: (token: string, email: string, notice?: string) => void;
  signOut: (notice?: string) => void;
  handleUnauthorized: (message?: string) => void;
  revalidateSession: () => Promise<void>;
  clearSessionMessages: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);

  const revalidateSession = useCallback(async () => {
    setStatus('checking');
    const stored = readStoredSession(localStorage);
    if (!stored.token) {
      setToken(null);
      setEmail('');
      setHasStoredCredentials(false);
      setStatus('unauthenticated');
      return;
    }

    setHasStoredCredentials(true);
    try {
      const result = await validateStoredSession(
        new ControlPlaneClient(stored.token),
        localStorage,
      );
      if (result.valid) {
        setToken(stored.token);
        setEmail(result.email || stored.email);
        setSessionError(null);
        setStatus('authenticated');
      } else if (result.reason === 'unauthorized') {
        setToken(null);
        setEmail('');
        setHasStoredCredentials(false);
        setSessionError(result.message);
        setSessionNotice(null);
        setStatus('unauthenticated');
      } else {
        setToken(null);
        setEmail(stored.email);
        setSessionError(result.message);
        setSessionNotice(null);
        setStatus('unauthenticated');
      }
    } catch (cause) {
      setToken(null);
      setEmail(stored.email);
      setSessionError(
        cause instanceof Error ? cause.message : 'Could not verify your session.',
      );
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void revalidateSession();
  }, [revalidateSession]);

  const completeAuth = useCallback((nextToken: string, nextEmail: string, notice?: string) => {
    writeStoredSession(localStorage, nextToken, nextEmail);
    setToken(nextToken);
    setEmail(nextEmail);
    setHasStoredCredentials(true);
    setSessionError(null);
    setSessionNotice(notice ?? null);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback((notice = 'Signed out.') => {
    clearStoredSession(localStorage);
    setToken(null);
    setEmail('');
    setHasStoredCredentials(false);
    setSessionError(null);
    setSessionNotice(notice);
    setStatus('unauthenticated');
  }, []);

  const handleUnauthorized = useCallback((message = 'Your session has expired. Please sign in again.') => {
    clearStoredSession(localStorage);
    setToken(null);
    setEmail('');
    setHasStoredCredentials(false);
    setSessionNotice(null);
    setSessionError(message);
    setStatus('unauthenticated');
  }, []);

  const clearSessionMessages = useCallback(() => {
    setSessionError(null);
    setSessionNotice(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      token,
      email,
      sessionError,
      sessionNotice,
      hasStoredCredentials,
      completeAuth,
      signOut,
      handleUnauthorized,
      revalidateSession,
      clearSessionMessages,
    }),
    [
      status,
      token,
      email,
      sessionError,
      sessionNotice,
      hasStoredCredentials,
      completeAuth,
      signOut,
      handleUnauthorized,
      revalidateSession,
      clearSessionMessages,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used inside AuthProvider');
  }
  return ctx;
}
