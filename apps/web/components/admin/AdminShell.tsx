'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Menu, X, PanelsTopLeft } from 'lucide-react';
import type { AuthUser, Permission } from '@archivato/shared';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { activeNavKey, visibleNav } from '@/components/admin/admin-nav';

/**
 * The unified staff/admin console shell: a permission-aware left sidebar (only
 * the consoles the viewer's roles grant) plus the page content, sitting below
 * the global app header. Applied to every staff console via route-group layouts
 * and to the staff overview. The sidebar re-resolves on focus so a just-granted
 * or -revoked permission appears/disappears without a hard reload (matching the
 * app's permission-revalidation convention). Server-side guards remain the real
 * boundary; this is navigation + UX only.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('admin');
  const pathname = usePathname() ?? '';
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      authApi
        .me()
        .then((me) => {
          if (active) {
            setUser(me);
            setLoaded(true);
          }
        })
        .catch(() => active && setLoaded(true));
    void load();

    const onFocus = () => void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const permissions: Permission[] = user?.permissions ?? [];
  const groups = useMemo(() => visibleNav(permissions), [permissions]);
  const activeKey = activeNavKey(pathname);

  const nav = (
    <SidebarNav groups={groups} activeKey={activeKey} loaded={loaded} user={user} />
  );

  return (
    <div className="mx-auto flex w-full max-w-[90rem] gap-0">
      {/* Desktop sidebar — sticky under the app header. The offset tracks the
          header's real height via --app-header-h (set by AuthGate), so it never
          overlaps a taller header / the email-verify banner. */}
      <aside className="sticky top-[var(--app-header-h)] hidden h-[calc(100vh-var(--app-header-h))] w-60 shrink-0 flex-col overflow-y-auto border-e border-border bg-muted/20 lg:flex">
        {nav}
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">
        {/* Mobile bar with the drawer toggle */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            aria-label={t('nav.menu')}
          >
            <Menu className="h-4 w-4" />
            {t('nav.console')}
          </button>
        </div>

        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-6">{children}</div>
      </main>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col overflow-y-auto border-e border-border bg-background shadow-xl animate-in ltr:slide-in-from-left rtl:slide-in-from-right">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 font-semibold">
                <PanelsTopLeft className="h-4 w-4 text-primary" />
                {t('nav.console')}
              </span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('nav.close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </div>
  );
}

function SidebarNav({
  groups,
  activeKey,
  loaded,
  user,
}: {
  groups: ReturnType<typeof visibleNav>;
  activeKey: string | null;
  loaded: boolean;
  user: AuthUser | null;
}) {
  const { t } = useTranslation('admin');

  return (
    <div className="flex h-full flex-col">
      <div className="hidden items-center gap-2 px-4 pb-2 pt-5 lg:flex">
        <PanelsTopLeft className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{t('nav.console')}</span>
      </div>

      <nav className="flex-1 space-y-5 px-3 py-3">
        {!loaded
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))
          : groups.map((group) => (
              <div key={group.key}>
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`nav.group.${group.labelKey}`)}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = item.key === activeKey;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
      </nav>

      {user && (
        <div className="border-t border-border px-4 py-3">
          <div className="truncate text-sm font-medium" dir="auto">
            {user.displayName || t('nav.staff')}
          </div>
          <div className="truncate text-xs text-muted-foreground" dir="ltr">
            {user.email}
          </div>
        </div>
      )}
    </div>
  );
}
