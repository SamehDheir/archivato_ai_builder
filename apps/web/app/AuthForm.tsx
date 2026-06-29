'use client';

import { useState } from 'react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '../lib/api';
import { ForgotPasswordForm } from './ForgotPasswordForm';

/**
 * The login/register form. Reused by the inline gate (`AuthGate`) and by the
 * dedicated `/login` and `/register` routes.
 *
 * `onSuccess` lets the caller decide what happens after auth: the inline gate
 * updates its own state; the standalone pages do a hard navigation so the
 * layout-level gate re-checks the session.
 */
export function AuthForm({
  initialMode = 'login',
  onSuccess,
}: {
  initialMode?: 'login' | 'register';
  onSuccess: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Forgot-password sub-flow + a one-off notice (e.g. after a successful reset).
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isRegister = mode === 'register';

  if (forgot) {
    return (
      <ForgotPasswordForm
        initialEmail={email}
        onBackToLogin={(message) => {
          setForgot(false);
          setMode('login');
          setError(null);
          if (message) setNotice(message);
        }}
      />
    );
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = isRegister
        ? await authApi.register({ email, password, displayName })
        : await authApi.login({ email, password });
      onSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1 className="title">Archivato AI Builder</h1>
      <p className="subtitle">
        AI Software Architecture Generator — sign in to start designing systems.
      </p>

      {/* Explicit tabs so Login and Register are always one click apart. */}
      <div className="tabs" role="tablist">
        <button
          type="button"
          className={!isRegister ? 'active' : ''}
          aria-selected={!isRegister}
          onClick={() => switchMode('login')}
        >
          Login
        </button>
        <button
          type="button"
          className={isRegister ? 'active' : ''}
          aria-selected={isRegister}
          onClick={() => switchMode('register')}
        >
          Register
        </button>
      </div>

      {notice && <div className="notice ok">{notice}</div>}

      <form className="panel" onSubmit={handleSubmit}>
        <h3>{isRegister ? 'Create your account' : 'Welcome back'}</h3>

        {isRegister && (
          <>
            <label htmlFor="displayName">Name</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ada Lovelace"
              required
            />
          </>
        )}

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
          minLength={isRegister ? 8 : undefined}
          required
        />

        {!isRegister && (
          <p style={{ textAlign: 'right', margin: '2px 0 0' }}>
            <button
              type="button"
              className="linklike"
              onClick={() => {
                setNotice(null);
                setForgot(true);
              }}
            >
              Forgot password?
            </button>
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email || password.length < (isRegister ? 8 : 1)}
        >
          {busy
            ? isRegister
              ? 'Creating…'
              : 'Signing in…'
            : isRegister
              ? 'Create account'
              : 'Sign in'}
        </button>
        {error && <div className="error">{error}</div>}
      </form>

      <p className="subtitle" style={{ textAlign: 'center' }}>
        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
        <button
          type="button"
          className="linklike"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
        >
          {isRegister ? 'Login' : 'Register'}
        </button>
      </p>
    </div>
  );
}
