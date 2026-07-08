'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { LogOut, Settings as SettingsIcon } from 'lucide-react';
import type { AuthUser } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/shared/UserAvatar';

/**
 * The header account control: an avatar button that opens a dropdown with the
 * user's identity, a Settings link, and Sign out. Follows the same dropdown
 * pattern as `NotificationBell` (relative wrapper + outside-click / Escape to
 * close; `end-0` so it's RTL-safe).
 */
export function AccountMenu({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while the menu is open.
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('header.account')}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center rounded-full ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <UserAvatar name={user.displayName} src={user.avatarUrl} size={32} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-2 w-60 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-border px-3 py-3">
            <UserAvatar name={user.displayName} src={user.avatarUrl} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" dir="auto">
                {user.displayName}
              </div>
              <div className="truncate text-xs text-muted-foreground" dir="ltr">
                {user.email}
              </div>
              {!user.emailVerified && (
                <Badge variant="warning" className="mt-1 text-[9px]">
                  {t('header.unverified')}
                </Badge>
              )}
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <SettingsIcon className="h-4 w-4 text-muted-foreground" />
              {t('header.settings')}
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 rtl:-scale-x-100" />
              {t('header.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
