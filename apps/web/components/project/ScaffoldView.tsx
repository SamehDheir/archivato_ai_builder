'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Code2, Download, GitBranch, ExternalLink, Check } from 'lucide-react';
import type { GithubConnectionStatus, GithubPushResult } from '@archivato/shared';
import { scaffoldApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Trigger a browser download for a Blob. */
function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * "Generate code" — turns the confirmed design into a runnable NestJS + Prisma
 * backend, delivered as a ZIP download or pushed to a new GitHub repo. The GitHub
 * push uses a stored OAuth connection ("Connect with GitHub"), with a Personal
 * Access Token as a fallback. Rendered inside the Pro-gated Export tab.
 */
export function ScaffoldView({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('stages');
  const [busy, setBusy] = useState<null | 'zip' | 'github' | 'connect'>(null);
  const [error, setError] = useState<string | null>(null);
  const [repoName, setRepoName] = useState('generated-backend');
  const [token, setToken] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [result, setResult] = useState<GithubPushResult | null>(null);
  const [conn, setConn] = useState<GithubConnectionStatus | null>(null);
  const [useTokenFallback, setUseTokenFallback] = useState(false);
  // Interval that watches the connect popup; cleared on unmount so it can't leak.
  const pollRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  const loadStatus = useCallback(async () => {
    try {
      setConn(await scaffoldApi.githubStatus());
    } catch {
      // Non-fatal: fall back to showing the connect button (click will report).
      setConn({ available: false, connected: false });
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Listen for the connect popup's result (postMessage from the API origin).
  useEffect(() => {
    const apiOrigin = scaffoldApi.apiOrigin();
    function onMessage(e: MessageEvent) {
      if (e.origin !== apiOrigin) return;
      const data = e.data as { source?: string; ok?: boolean } | null;
      if (!data || data.source !== 'archivato-github') return;
      setBusy(null);
      if (data.ok) {
        setError(null);
        void loadStatus();
      } else {
        setError(t('scaffold.connectFailed'));
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadStatus, t]);

  async function downloadZip() {
    setBusy('zip');
    setError(null);
    try {
      const blob = await scaffoldApi.zip(sessionId);
      downloadBlob(`scaffold-${sessionId}.zip`, blob);
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  function connect() {
    setError(null);
    setBusy('connect');
    const w = window.open(
      scaffoldApi.githubConnectUrl(),
      'archivato-github-connect',
      'width=680,height=760,menubar=no,toolbar=no',
    );
    // If the popup is blocked, or the user closes it, stop the spinner.
    if (!w) {
      setBusy(null);
      setError(t('scaffold.connectFailed'));
      return;
    }
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      if (w.closed) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy((b) => (b === 'connect' ? null : b));
      }
    }, 700);
  }

  async function disconnect() {
    setError(null);
    try {
      await scaffoldApi.disconnectGithub();
      await loadStatus();
    } catch (e) {
      setError(msg(e));
    }
  }

  async function push(e: React.FormEvent) {
    e.preventDefault();
    setBusy('github');
    setError(null);
    setResult(null);
    try {
      const r = await scaffoldApi.pushToGithub(sessionId, {
        repoName,
        isPrivate,
        // Only send a PAT when using the fallback; otherwise use the stored connection.
        ...(useTokenFallback ? { token } : {}),
      });
      setResult(r);
      setToken('');
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(null);
    }
  }

  const connected = conn?.connected ?? false;
  // Show the token form when the user opts into the fallback, or when the OAuth
  // app isn't configured on the server and they aren't already connected.
  const showTokenForm = useTokenFallback;

  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="flex items-center gap-2">
        <Code2 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t('scaffold.title')}</h3>
      </div>
      <p className="mt-2 text-sm text-muted-foreground" dir="auto">
        {t('scaffold.intro')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground" dir="auto">
        {t('scaffold.note')}
      </p>

      <div className="mt-3">
        <Button variant="secondary" disabled={!!busy} onClick={downloadZip}>
          <Download />{' '}
          {busy === 'zip' ? t('scaffold.preparing') : t('scaffold.downloadZip')}
        </Button>
      </div>

      {/* Push to GitHub */}
      <div className="mt-6 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <h4 className="text-sm font-semibold">{t('scaffold.githubTitle')}</h4>
        </div>
        <p className="mt-1 text-xs text-muted-foreground" dir="auto">
          {t('scaffold.githubDesc')}
        </p>

        {/* Connection state (unless the user chose the token fallback) */}
        {!showTokenForm && connected && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span dir="ltr">
              {t('scaffold.connectedAs', { login: conn?.login })}
            </span>
            <button
              type="button"
              onClick={disconnect}
              className="ms-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {t('scaffold.disconnect')}
            </button>
          </div>
        )}

        {!showTokenForm && !connected && (
          <div className="mt-3">
            <Button onClick={connect} disabled={!!busy}>
              <GitBranch />{' '}
              {busy === 'connect'
                ? t('scaffold.connecting')
                : t('scaffold.connect')}
            </Button>
            {conn && !conn.available && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-500" dir="auto">
                {t('scaffold.notConfigured')}
              </p>
            )}
          </div>
        )}

        {/* Repo form: shown once connected, or in the token fallback */}
        {(connected || showTokenForm) && (
          <form onSubmit={push} className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t('scaffold.repoName')}
              </label>
              <Input
                dir="ltr"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                pattern="[A-Za-z0-9._-]+"
                required
                className="mt-1"
              />
            </div>

            {showTokenForm && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {t('scaffold.token')}
                </label>
                <Input
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                  {t('scaffold.tokenHelp')}
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              {t('scaffold.private')}
            </label>
            <Button
              type="submit"
              disabled={!!busy || (showTokenForm && !token)}
            >
              <GitBranch />{' '}
              {busy === 'github' ? t('scaffold.pushing') : t('scaffold.push')}
            </Button>
          </form>
        )}

        {/* Toggle between OAuth and the PAT fallback */}
        <button
          type="button"
          onClick={() => {
            setUseTokenFallback((v) => !v);
            setError(null);
          }}
          className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {showTokenForm ? t('scaffold.useConnect') : t('scaffold.useToken')}
        </button>

        {result && (
          <div className="mt-3 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
            <p dir="auto">{t('scaffold.success', { repo: result.repo })}</p>
            <a
              href={result.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
            >
              {t('scaffold.view')}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" dir="auto">
          {error}
        </p>
      )}
    </div>
  );
}
