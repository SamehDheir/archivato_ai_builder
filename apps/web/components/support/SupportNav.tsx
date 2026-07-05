'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  LifeBuoy,
  Plus,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  /** Key under `support:nav`. */
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Match this exact path only (else prefix-match). */
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  { href: '/support', labelKey: 'dashboard', icon: LayoutDashboard, exact: true },
  { href: '/support/new', labelKey: 'new', icon: Plus },
  { href: '/support/kb', labelKey: 'kb', icon: BookOpen },
  { href: '/support/admin', labelKey: 'admin', icon: ShieldCheck, adminOnly: true },
];

/**
 * The Support Center's own sub-navigation (Dashboard · New · Knowledge Base ·
 * Admin). Rendered at the top of every support page; the "Admin" tab appears
 * only for admins.
 */
export function SupportNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? '';
  const { t } = useTranslation('support');

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">{t('nav.title')}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('nav.subtitle')}</p>
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-border">
        {ITEMS.filter((i) => !i.adminOnly || isAdmin).map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`nav.${item.labelKey}`)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Splits a message body into text + fenced ``` code blocks (lightweight MD). */
export function MessageBody({ body }: { body: string }) {
  const parts = body.split(/```/g);
  return (
    <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            dir="ltr"
            className="my-2 overflow-x-auto rounded-md border border-border bg-muted/60 p-3 text-xs"
          >
            <code>{part.replace(/^\w*\n/, '')}</code>
          </pre>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}
