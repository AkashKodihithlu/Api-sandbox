'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useId, useState } from 'react';
import { ControlPlaneClient, ControlPlaneError } from '../lib/control-plane';
import { getPasswordMinLength } from '../lib/session';
import { useAuthSession } from './auth-provider';
import { BrandMark } from './brand';
import { ThemeToggle } from './theme-toggle';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const isRegister = mode === 'signup';
  const minPasswordLength = getPasswordMinLength(isRegister);
  const router = useRouter();
  const {
    status,
    sessionError,
    sessionNotice,
    hasStoredCredentials,
    completeAuth,
    revalidateSession,
    clearSessionMessages,
  } = useAuthSession();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const passwordHintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [status, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    clearSessionMessages();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError('Email is required.');
      return;
    }
    if (password.length < minPasswordLength) {
      setFormError(
        isRegister
          ? `Password must be at least ${minPasswordLength} characters long.`
          : 'Password is required.',
      );
      return;
    }

    setBusy(true);
    try {
      const client = new ControlPlaneClient();
      const session = isRegister
        ? await client.register(trimmedEmail, password, displayName)
        : await client.signIn(trimmedEmail, password);
      completeAuth(
        session.token,
        session.user.email || trimmedEmail,
        isRegister ? 'Account created. Welcome to MockFlow.' : 'Signed in.',
      );
      router.replace('/dashboard');
    } catch (cause) {
      if (cause instanceof ControlPlaneError) {
        setFormError(cause.message);
      } else {
        setFormError('Could not reach the control plane. Please check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const activeError = formError ?? sessionError;

  return (
    <div className="auth-page">
      <header className="public-header">
        <div className="public-header-inner">
          <BrandMark href="/" />
          <div className="public-header-actions">
            <Link href="/" className="button button-secondary">
              Back to home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="auth-main">
        {status === 'checking' ? (
          <section className="panel auth-card" role="status" aria-live="polite">
            <div className="panel-header">
              <h1>Checking session</h1>
            </div>
            <div className="empty-state">
              <div className="empty-mark">⌘</div>
              <h2>Verifying saved session</h2>
              <p>Confirming your credentials with the MockFlow control plane…</p>
            </div>
          </section>
        ) : (
          <section className="panel auth-card">
            <div className="panel-header">
              <h1>{isRegister ? 'Create your MockFlow account' : 'Sign in to MockFlow'}</h1>
            </div>

            <div className="auth-card-body">
              <p className="auth-subtitle">
                {isRegister
                  ? 'Register to create mock API projects, configure scenarios, and test endpoints.'
                  : 'Enter your control-plane credentials to open your workspace dashboard.'}
              </p>

              {sessionNotice && (
                <p className="notice" role="status">
                  {sessionNotice}
                </p>
              )}

              {activeError && (
                <div className="error" id={errorId} role="alert">
                  <p style={{ margin: 0 }}>{activeError}</p>
                  {hasStoredCredentials && !formError && (
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ marginTop: '10px' }}
                      onClick={() => void revalidateSession()}
                    >
                      Retry session verification
                    </button>
                  )}
                </div>
              )}

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                {isRegister && (
                  <div className="field-group">
                    <label htmlFor="auth-display-name">
                      Display name <span className="field-optional">(optional)</span>
                    </label>
                    <input
                      id="auth-display-name"
                      name="displayName"
                      type="text"
                      autoComplete="name"
                      maxLength={120}
                      placeholder="Alex Rivera"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                )}

                <div className="field-group">
                  <label htmlFor="auth-email">Email address</label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    aria-invalid={Boolean(activeError)}
                    aria-describedby={activeError ? errorId : undefined}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="auth-password">Password</label>
                  <div className="password-input-wrap">
                    <input
                      id="auth-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      required
                      minLength={minPasswordLength}
                      maxLength={256}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      aria-invalid={Boolean(activeError)}
                      aria-describedby={isRegister ? passwordHintId : undefined}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      disabled={busy}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {isRegister && (
                    <small id={passwordHintId} className="field-hint">
                      Minimum {minPasswordLength} characters required for new accounts.
                    </small>
                  )}
                </div>

                <div className="auth-actions">
                  <button type="submit" className="button button-primary button-full" disabled={busy}>
                    {busy
                      ? isRegister
                        ? 'Creating account…'
                        : 'Signing in…'
                      : isRegister
                        ? 'Create account'
                        : 'Sign in'}
                  </button>
                </div>
              </form>

              <div className="auth-footer-link">
                {isRegister ? (
                  <>
                    <span>Already have an account?</span>{' '}
                    <Link href="/signin" onClick={() => clearSessionMessages()}>
                      Sign in
                    </Link>
                  </>
                ) : (
                  <>
                    <span>New to MockFlow?</span>{' '}
                    <Link href="/signup" onClick={() => clearSessionMessages()}>
                      Create an account
                    </Link>
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
