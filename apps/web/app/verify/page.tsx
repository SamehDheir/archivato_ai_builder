'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Email-verification landing page (Slice 9b). The verification email links here
 * with `?token=…`; we confirm it against the API and report the result.
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
    <div className="mx-auto max-w-md px-5 py-12">
      <h1 className="mb-6 text-2xl font-bold">Email verification</h1>

      {status === 'verifying' && (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Verifying your email…</p>
        </div>
      )}

      {status === 'ok' && (
        <Card>
          <CardContent className="p-5">
            <Badge className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Verified
            </Badge>
            <p className="mt-3">{message}</p>
            <Button asChild className="mt-4">
              <a href="/">Continue to Archivato</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'error' && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold">Verification failed</h3>
            <p className="mt-1 text-sm text-destructive">{message}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in and use “Resend email” to get a fresh link.
            </p>
            <Button asChild variant="secondary" className="mt-4">
              <a href="/">Back to sign in</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
