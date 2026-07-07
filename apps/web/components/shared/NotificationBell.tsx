'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import type { NotificationView, NotificationsPage } from '@archivato/shared';
import { notificationsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** How often the bell re-polls for new notifications while the tab is open. */
const POLL_MS = 60_000;

/**
 * Header bell + dropdown for in-app notifications. Polls the unread count on an
 * interval and on tab focus (like the permission revalidation elsewhere), shows
 * an unread badge, and lets the user mark all read / open a notification's
 * linked ticket. Best-effort throughout — a failed fetch never breaks the app.
 */
export function NotificationBell() {
  const { t, i18n } = useTranslation('common');
  const [page, setPage] = useState<NotificationsPage>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    notificationsApi.list().then(setPage).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  // Close on outside click / Escape while the dropdown is open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function markAll() {
    try {
      setPage(await notificationsApi.markAll());
    } catch {
      /* best-effort */
    }
  }

  function openItem(n: NotificationView) {
    setOpen(false);
    if (n.read) return;
    // Optimistically clear the dot; fire-and-forget the server update.
    setPage((p) => ({
      items: p.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)),
      unread: Math.max(0, p.unread - 1),
    }));
    notificationsApi.markRead(n.id).catch(() => undefined);
  }

  const { unread, items } = page;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t('notifications.title')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            dir="ltr"
            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">{t('notifications.title')}</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                {t('notifications.markAll')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {t('notifications.empty')}
              </p>
            ) : (
              items.map((n) => {
                const body = <NotificationRow n={n} lang={i18n.language} />;
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => openItem(n)}>
                    {body}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    className="block w-full text-start"
                    onClick={() => openItem(n)}
                  >
                    {body}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ n, lang }: { n: NotificationView; lang: string }) {
  return (
    <div
      className={cn(
        'flex gap-2 border-b border-border/60 px-3 py-2.5 transition-colors last:border-0 hover:bg-muted/50',
        !n.read && 'bg-primary/5',
      )}
    >
      <span
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          n.read ? 'bg-transparent' : 'bg-primary',
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium" dir="auto">
          {n.title}
        </div>
        <div className="line-clamp-2 text-xs text-muted-foreground" dir="auto">
          {n.body}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground" dir="ltr">
          {relativeTime(n.createdAt, lang)}
        </div>
      </div>
    </div>
  );
}

/** Compact locale-aware relative time ("5m ago"); Arabic uses Latin numerals. */
function relativeTime(iso: string, lang: string): string {
  const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : lang || 'en';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const mon = Math.round(day / 30);
  if (Math.abs(sec) < 60) return rtf.format(-sec, 'second');
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  if (Math.abs(mon) < 12) return rtf.format(-mon, 'month');
  return rtf.format(-Math.round(mon / 12), 'year');
}
