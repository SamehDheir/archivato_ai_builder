'use client';

import { useEffect, useState } from 'react';
import { authApi } from '../../lib/api';

/**
 * Email-verification landing page (Slice 9b). The verification email links here
 * with `?token=…`; we confirm it against the API and report the result.
 *
 * Reads the token from `window.location` (instead of `useSearchParams`) to keep
 * the page a simple client component with no Suspense boundary requirement.
 */
export default function VerifyPage() {
  const [status, setStatus] = useState<'verifying' | 'ok' | 'error'>(
    'verifying',
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then((user) => {
        setStatus('ok');
        setMessage(`Your email (${user.email}) is now verified.`);
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(
          err instanceof Error
            ? err.message
            : 'This link is invalid or has expired.',
        );
      });
  }, []);

  return (
    <div className="container">
      <h1 className="title">Email verification</h1>

      {status === 'verifying' && (
        <div className="loading-screen">
          <div className="spinner" />
          <p className="subtitle" style={{ margin: 0 }}>
            Verifying your email…
          </p>
        </div>
      )}

      {status === 'ok' && (
        <div className="panel">
          <span className="badge">✓ Verified</span>
          <p style={{ marginTop: 12 }}>{message}</p>
          <a href="/">
            <button type="button">Continue to Archivato</button>
          </a>
        </div>
      )}

      {status === 'error' && (
        <div className="panel">
          <h3>Verification failed</h3>
          <p className="error">{message}</p>
          <p className="subtitle">
            Sign in and use “Resend email” to get a fresh link.
          </p>
          <a href="/">
            <button type="button" className="secondary">
              Back to sign in
            </button>
          </a>
        </div>
      )}
    </div>
  );
}
