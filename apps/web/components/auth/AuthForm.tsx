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
  'oauth_email_unverified',
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      {/* Blueprint grid backdrop — echoes the landing page's "system design" concept. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] dark:opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage:
            'radial-gradient(ellipse 60% 50% at 50% 45%, #000 55%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 60% 50% at 50% 45%, #000 55%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/4 -z-10 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm ring-1 ring-primary/10">
            <LogoMark className="h-8 w-8" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

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
              <div className="relative" dir="ltr">
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
                className="flex-1 gap-2"
                onClick={() => startOauth('google')}
              >
                <GoogleIcon className="h-4 w-4" />
                Google
              </Button>
            )}
            {oauth.github && (
              <Button
                type="button"
                variant="secondary"
                className="flex-1 gap-2"
                onClick={() => startOauth('github')}
              >
                <GithubIcon className="h-4 w-4" />
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
    </div>
  );
}

/** Google's four-colour "G" mark (brand SVG; unaffected by theme/RTL). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

/** GitHub's Octocat mark (monochrome — inherits the button's text colour). */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.41 1.02.01 2.04.14 3 .41 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.22.7.83.58C20.56 22.29 24 17.8 24 12.5 24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}
