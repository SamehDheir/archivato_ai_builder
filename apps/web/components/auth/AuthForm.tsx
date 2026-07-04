'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import type { AuthUser } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { getDeviceFingerprint } from '@/lib/device-fingerprint';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { LogoMark } from '@/components/shared/Logo';

/** Known OAuth error codes we surface (translated via `auth.oauthError.*`). */
const OAUTH_ERROR_CODES = new Set([
  'oauth_unavailable',
  'oauth_state',
  'oauth_failed',
  'oauth_device',
]);

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
  const { t } = useTranslation('auth');
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [oauthErrorCode, setOauthErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    if (err && OAUTH_ERROR_CODES.has(err)) setOauthErrorCode(err);
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

  /** Compute the device fingerprint, then hand off to the OAuth start URL. */
  async function startOauth(provider: 'google' | 'github') {
    const fingerprint = await getDeviceFingerprint().catch(() => undefined);
    window.location.href = authApi.oauthStartUrl(provider, fingerprint);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = isRegister
        ? await authApi.register({
            email,
            password,
            displayName,
            // One account per device (anti-spam) — see the notice below the form.
            fingerprint: await getDeviceFingerprint(),
          })
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
      <div className="flex items-center gap-2.5">
        <LogoMark className="h-9 w-9" />
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </div>
      <p className="mb-6 mt-2 text-sm text-muted-foreground">{t('subtitle')}</p>

      <Tabs
        value={mode}
        onValueChange={(v) => switchMode(v as 'login' | 'register')}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="login">{t('tab.login')}</TabsTrigger>
          <TabsTrigger value="register">{t('tab.register')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {notice && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      {oauthErrorCode && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t(`oauthError.${oauthErrorCode}`)}
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <h3 className="font-semibold">
              {isRegister ? t('heading.register') : t('heading.login')}
            </h3>

            {isRegister && (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {t('device.pre')}
                <strong>{t('device.strong')}</strong>
                {t('device.post')}
              </p>
            )}

            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="displayName">{t('field.name')}</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('field.namePlaceholder')}
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">{t('field.email')}</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('field.emailPlaceholder')}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('field.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    isRegister
                      ? t('field.passwordRegisterPlaceholder')
                      : '••••••••'
                  }
                  minLength={isRegister ? 8 : undefined}
                  className="pe-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? t('hidePassword') : t('showPassword')
                  }
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {!isRegister && (
              <div className="text-end">
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
                  {t('forgot')}
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
                  ? t('submit.registering')
                  : t('submit.loggingIn')
                : isRegister
                  ? t('submit.register')
                  : t('submit.login')}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>

      {(oauth.google || oauth.github) && (
        <div className="mt-4">
          <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
            <span>{isRegister ? t('divider.register') : t('divider.login')}</span>
          </div>
          <div className="flex gap-2">
            {oauth.google && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => startOauth('google')}
              >
                Google
              </Button>
            )}
            {oauth.github && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => startOauth('github')}
              >
                GitHub
              </Button>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isRegister ? t('switch.haveAccount') : t('switch.noAccount')}{' '}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => switchMode(isRegister ? 'login' : 'register')}
        >
          {isRegister ? t('switch.toLogin') : t('switch.toRegister')}
        </Button>
      </p>
    </div>
  );
}
