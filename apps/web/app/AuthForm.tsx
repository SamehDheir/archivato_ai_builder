'use client';

import { useEffect, useState } from 'react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ForgotPasswordForm } from './ForgotPasswordForm';

const OAUTH_ERRORS: Record<string, string> = {
  oauth_unavailable: 'That sign-in provider is not configured.',
  oauth_state: 'Sign-in expired or was interrupted. Please try again.',
  oauth_failed: 'Sign-in failed. Please try again.',
};

/**
 * The login/register form. Reused by the inline gate (`AuthGate`) and by the
 * dedicated `/login` and `/register` routes.
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
  const [forgot, setForgot] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [oauth, setOauth] = useState<{ google: boolean; github: boolean }>({
    google: false,
    github: false,
  });

  const isRegister = mode === 'register';

  useEffect(() => {
    authApi.oauthProviders().then(setOauth).catch(() => undefined);
    const err = new URLSearchParams(window.location.search).get('error');
    if (err && OAUTH_ERRORS[err]) setError(OAUTH_ERRORS[err]);
  }, []);

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
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-2xl font-bold">Archivato AI Builder</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        AI Software Architecture Generator — sign in to start designing systems.
      </p>

      <Tabs
        value={mode}
        onValueChange={(v) => switchMode(v as 'login' | 'register')}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
        </TabsList>
      </Tabs>

      {notice && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <h3 className="font-semibold">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h3>

            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ada Lovelace"
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
                minLength={isRegister ? 8 : undefined}
                required
              />
            </div>

            {!isRegister && (
              <div className="text-right">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => {
                    setNotice(null);
                    setForgot(true);
                  }}
                >
                  Forgot password?
                </Button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={busy || !email || password.length < (isRegister ? 8 : 1)}
            >
              {busy
                ? isRegister
                  ? 'Creating…'
                  : 'Signing in…'
                : isRegister
                  ? 'Create account'
                  : 'Sign in'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {(oauth.google || oauth.github) && (
        <div className="mt-4">
          <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            <span>or {isRegister ? 'sign up' : 'continue'} with</span>
          </div>
          <div className="flex gap-2">
            {oauth.google && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  window.location.href = authApi.oauthStartUrl('google');
                }}
              >
                Google
              </Button>
            )}
            {oauth.github && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  window.location.href = authApi.oauthStartUrl('github');
                }}
              >
                GitHub
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
        >
          {isRegister ? 'Login' : 'Register'}
        </Button>
      </p>
    </div>
  );
}
