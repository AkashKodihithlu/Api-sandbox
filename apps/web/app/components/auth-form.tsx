'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useId, useState } from 'react';
import { ControlPlaneClient, ControlPlaneError } from '../lib/control-plane';
import { getPasswordMinLength } from '../lib/session';
import { useAuthSession } from './auth-provider';
import { BrandMark } from './brand';
import { ApiIcon, EnvironmentIcon, EyeIcon, EyeOffIcon, HistoryIcon, TerminalIcon } from './icons';
import { ThemeToggle } from './theme-toggle';

/* ------------------------------------------------------------------
   Google SVG G logo (multicolor, faithful to brand guidelines)
   ------------------------------------------------------------------ */
function GoogleGLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/* ------------------------------------------------------------------
   Auth brand-side feature highlights
   ------------------------------------------------------------------ */
const authFeatures = [
  {
    icon: <ApiIcon width={15} height={15} />,
    title: 'Scenario-driven mock APIs',
    desc: 'Draft, configure, and publish endpoints with scenario-based response controls.',
  },
  {
    icon: <EnvironmentIcon width={15} height={15} />,
    title: 'Named environments',
    desc: 'Override scenarios per environment via a single request header.',
  },
  {
    icon: <HistoryIcon width={15} height={15} />,
    title: 'Redacted request history',
    desc: 'Inspect live traffic with automatic header redaction and latency metrics.',
  },
];

/* ------------------------------------------------------------------
   Component
   ------------------------------------------------------------------ */
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
  const [googleNotice, setGoogleNotice] = useState(false);

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

  /* Loading / checking state */
  if (status === 'checking') {
    return (
      <div className="auth-page">
        <header className="public-header">
          <div className="public-header-inner">
            <BrandMark href="/" />
            <div className="public-header-actions">
              <Link href="/" className="button button-secondary">Back to home</Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="auth-split" style={{ display: 'grid', placeItems: 'center' }}>
          <section className="panel auth-loading-panel" role="status" aria-live="polite">
            <div className="panel-header">
              <h1>Checking session</h1>
            </div>
            <div className="empty-state">
              <div className="empty-mark">
                <TerminalIcon />
              </div>
              <h2>Verifying saved session</h2>
              <p>Confirming your credentials with the MockFlow control plane…</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      {/* Header */}
      <header className="public-header">
        <div className="public-header-inner">
          <BrandMark href="/" />
          <div className="public-header-actions">
            <Link href="/" className="button button-secondary">Back to home</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Split body */}
      <div className="auth-split">
        {/* ── Left: form ── */}
        <div className="auth-form-side">
          <div className="auth-form-box">
            <div className="auth-form-header">
              <h1>{isRegister ? 'Create your account' : 'Sign in to MockFlow'}</h1>
              <p className="auth-subtitle">
                {isRegister
                  ? 'Register to create mock API projects, configure scenarios, and test endpoints.'
                  : 'Enter your credentials to open your workspace dashboard.'}
              </p>
            </div>

            {/* Google button */}
            <button
              type="button"
              className="button button-google"
              onClick={() => setGoogleNotice((v) => !v)}
              aria-expanded={googleNotice}
            >
              <span className="google-badge" aria-hidden="true">
                <GoogleGLogo />
              </span>
              <span className="google-badge-label">Continue with Google</span>
            </button>

            {googleNotice && (
              <p className="google-notice visible" role="status">
                Google sign-in is not yet available. Please use your email and password below.
              </p>
            )}

            {/* Divider */}
            <div className="auth-divider" aria-hidden="true">
              <span className="auth-divider-line" />
              <span className="auth-divider-text">or continue with email</span>
              <span className="auth-divider-line" />
            </div>

            {/* Session notices */}
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

            {/* Form */}
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
                    {showPassword ? (
                      <EyeOffIcon width={15} height={15} />
                    ) : (
                      <EyeIcon width={15} height={15} />
                    )}
                  </button>
                </div>
                {isRegister && (
                  <small id={passwordHintId} className="field-hint">
                    Minimum {minPasswordLength} characters required for new accounts.
                  </small>
                )}
              </div>

              <div className="auth-actions">
                <button
                  type="submit"
                  className="button button-primary button-full"
                  disabled={busy}
                >
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
        </div>

        {/* ── Right: brand panel ── */}
        <div className="auth-brand-side" aria-hidden="true">
          <div className="auth-brand-content">
            <div className="auth-brand-mark">
              <BrandMark />
            </div>
            <h2 className="auth-brand-tagline">
              Mock APIs that keep
              <br />
              your team moving.
            </h2>
            <p className="auth-brand-lead">
              Define scenario-driven endpoints, publish to the runtime, and inspect live traffic —
              all from one workspace.
            </p>
            <div className="auth-features">
              {authFeatures.map((f) => (
                <div className="auth-feature" key={f.title}>
                  <span className="auth-feature-icon">{f.icon}</span>
                  <div className="auth-feature-text">
                    <strong>{f.title}</strong>
                    <span>{f.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
