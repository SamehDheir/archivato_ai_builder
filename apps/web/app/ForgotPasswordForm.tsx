'use client';

import { useState } from 'react';
import { authApi } from '../lib/api';

/**
 * Forgot-password OTP flow (Slice 9b): request a 6-digit code by email, then
 * submit the code + a new password. On success, returns to the login screen.
 */
export function ForgotPasswordForm({
  initialEmail = '',
  onBackToLogin,
}: {
  initialEmail?: string;
  onBackToLogin: (message?: string) => void;
}) {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.resetPassword(email, code, newPassword);
      onBackToLogin('Password updated — sign in with your new password.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1 className="title">Reset your password</h1>

      {step === 'request' ? (
        <form className="panel" onSubmit={requestCode}>
          <h3>Forgot password</h3>
          <p className="subtitle">
            Enter your email and we'll send a 6-digit reset code.
          </p>
          <label htmlFor="fp-email">Email</label>
          <input
            id="fp-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
          <button type="submit" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send reset code'}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      ) : (
        <form className="panel" onSubmit={submitReset}>
          <h3>Enter your code</h3>
          <p className="subtitle">
            If <strong>{email}</strong> has an account, a 6-digit code is on its
            way. It expires in 10 minutes.
          </p>
          <label htmlFor="fp-code">Reset code</label>
          <input
            id="fp-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            required
          />
          <label htmlFor="fp-password">New password</label>
          <input
            id="fp-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
          <button
            type="submit"
            disabled={busy || code.length !== 6 || newPassword.length < 8}
          >
            {busy ? 'Updating…' : 'Set new password'}
          </button>
          {error && <div className="error">{error}</div>}
          <p className="subtitle" style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="linklike"
              onClick={() => setStep('request')}
            >
              Use a different email
            </button>
          </p>
        </form>
      )}

      <p className="subtitle" style={{ textAlign: 'center' }}>
        <button
          type="button"
          className="linklike"
          onClick={() => onBackToLogin()}
        >
          Back to login
        </button>
      </p>
    </div>
  );
}
