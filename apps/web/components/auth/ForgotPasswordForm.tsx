'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const { t } = useTranslation('auth');
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
      onBackToLogin(t('forgotForm.successNotice'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="mb-6 text-2xl font-bold">{t('forgotForm.title')}</h1>

      <Card>
        <CardContent className="p-5">
          {step === 'request' ? (
            <form className="space-y-3" onSubmit={requestCode}>
              <h3 className="font-semibold">{t('forgotForm.requestHeading')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('forgotForm.requestHelp')}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="fp-email">{t('field.email')}</Label>
                <Input
                  id="fp-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('field.emailPlaceholder')}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !email}>
                {busy ? t('forgotForm.sending') : t('forgotForm.send')}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          ) : (
            <form className="space-y-3" onSubmit={submitReset}>
              <h3 className="font-semibold">{t('forgotForm.codeHeading')}</h3>
              <p className="text-sm text-muted-foreground" dir="auto">
                {t('forgotForm.codeHelpPre')}
                <strong>{email}</strong>
                {t('forgotForm.codeHelpPost')}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="fp-code">{t('forgotForm.code')}</Label>
                <Input
                  id="fp-code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  dir="ltr"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fp-password">{t('forgotForm.newPassword')}</Label>
                <Input
                  id="fp-password"
                  type="password"
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('field.passwordRegisterPlaceholder')}
                  minLength={8}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || code.length !== 6 || newPassword.length < 8}
              >
                {busy ? t('forgotForm.updating') : t('forgotForm.setPassword')}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-center">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setStep('request')}
                >
                  {t('forgotForm.differentEmail')}
                </Button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => onBackToLogin()}
        >
          {t('forgotForm.backToLogin')}
        </Button>
      </p>
    </div>
  );
}
