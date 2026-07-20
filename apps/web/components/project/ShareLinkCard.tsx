'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Eye, Globe, Link2, Trash2 } from 'lucide-react';
import { sharePath, type ShareLink } from '@archivato/shared';
import { shareApi } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/shared/toast';
import { useConfirm } from '@/components/shared/confirm-dialog';

/**
 * "Share a public link" — mints an unguessable, read-only URL for the design that
 * anyone can open without an account.
 *
 * **Free on every plan, and deliberately not inside the Export tab.** It used to
 * live there, Pro-gated alongside the exports — which meant the only users who
 * could hand out a link were the ones already paying, and a free user couldn't
 * even *reach* the control (the Export tab needs an API design, a Pro stage).
 * Sharing is the product's organic loop, so it now sits in the project header
 * where every owner can see it, and the API mints a link as soon as the database
 * design exists (`dbDesign` here mirrors that gate).
 *
 * Revoke is deliberately a hard delete: the old URL 404s forever and re-sharing
 * mints a fresh token. There is no "pause".
 */
export function ShareLinkCard({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('stages');
  const fmt = useFormat();
  const toast = useToast();
  const confirm = useConfirm();

  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    shareApi
      .get(sessionId)
      .then((l) => alive && setLink(l))
      .catch(() => undefined) // non-fatal: the card just offers to create one
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sessionId]);

  /**
   * Absolute URL of the public page. Client components are still server-rendered,
   * so `window` must be guarded rather than relied on being unreachable — today
   * `link` merely happens to be null on the server.
   */
  const url =
    link && typeof window !== 'undefined'
      ? `${window.location.origin}${sharePath(link.token)}`
      : null;

  const create = useCallback(async () => {
    setBusy(true);
    try {
      setLink(await shareApi.create(sessionId));
      toast({ title: t('share.created'), variant: 'success' });
    } catch {
      toast({ title: t('share.failed'), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }, [sessionId, t, toast]);

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function revoke() {
    const ok = await confirm({
      title: t('share.revokeTitle'),
      description: t('share.revokeDesc'),
      confirmLabel: t('share.revokeConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await shareApi.revoke(sessionId);
      setLink(null);
      toast({ title: t('share.revoked'), variant: 'success' });
    } catch {
      toast({ title: t('share.failed'), variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-muted/30 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Globe className="h-4 w-4" />
        {t('share.title')}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{t('share.intro')}</p>

      {loading ? null : !link ? (
        <Button className="mt-3" disabled={busy} onClick={create}>
          <Link2 className="h-4 w-4" />
          {busy ? t('share.creating') : t('share.create')}
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              dir="ltr"
              value={url ?? ''}
              onFocus={(e) => e.currentTarget.select()}
              className="max-w-lg font-mono text-xs"
              aria-label={t('share.title')}
            />
            <Button variant="secondary" disabled={busy} onClick={copy}>
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? t('share.copied') : t('share.copy')}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={revoke}>
              <Trash2 className="h-4 w-4" />
              {t('share.revoke')}
            </Button>
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            {t('share.views', { n: link.viewCount })}
            {/* "Never opened" is a different conversation from "read an hour
                ago", so the two states are worth distinguishing explicitly
                rather than just omitting the line. */}
            <span aria-hidden>·</span>
            {link.lastViewedAt ? (
              <span className="text-foreground">
                {t('share.lastViewed', { time: fmt.relative(link.lastViewedAt) })}
              </span>
            ) : (
              <span>{t('share.neverViewed')}</span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}
