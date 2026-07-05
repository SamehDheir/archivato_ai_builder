'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Inbox } from 'lucide-react';
import {
  hasPermission,
  type SupportCustomerStats,
  type SupportTicketStatus,
  type SupportTicketSummary,
} from '@archivato/shared';
import { supportApi } from '@/lib/api';
import { usePageAccess, customerOnly } from '@/lib/use-page-access';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { SupportNav } from '@/components/support/SupportNav';
import {
  CategoryBadge,
  PriorityBadge,
  STATUSES,
  StatusBadge,
  useSupportMeta,
} from '@/components/support/support-meta';

const ALL = 'all';

export default function SupportDashboardPage() {
  const { t, statusLabel, timeAgo } = useSupportMeta();
  const user = usePageAccess(customerOnly);
  const [stats, setStats] = useState<SupportCustomerStats | null>(null);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus | typeof ALL>(ALL);

  const loadList = useCallback(async () => {
    const res = await supportApi.list({
      search: search || undefined,
      status: status === ALL ? undefined : status,
      pageSize: 50,
    });
    setTickets(res.tickets);
  }, [search, status]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supportApi
      .stats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Reload the list when filters change (debounced for search typing).
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void loadList().catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [user, loadList]);

  const tiles: { label: string; value: number }[] = stats
    ? [
        { label: t('dashboard.tileTotal'), value: stats.total },
        { label: t('dashboard.tileOpen'), value: stats.open + stats.inProgress },
        { label: t('dashboard.tileWaiting'), value: stats.waiting },
        { label: t('dashboard.tileResolved'), value: stats.resolved },
      ]
    : [];

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <SupportNav canManageSupport={hasPermission(user.permissions, 'support:read_all')} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))
          : tiles.map((t) => (
              <Card key={t.label} className="p-4">
                <div className="text-2xl font-bold">{t.value}</div>
                <div className="text-xs text-muted-foreground">{t.label}</div>
              </Card>
            ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('dashboard.searchPlaceholder')}
            className="ps-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as SupportTicketStatus | typeof ALL)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('dashboard.allStatuses')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button asChild>
          <Link href="/support/new">
            <Plus className="me-1.5 h-4 w-4" /> {t('dashboard.newTicket')}
          </Link>
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('dashboard.emptyTitle')}
            description={t('dashboard.emptyBody')}
          >
            <Button asChild>
              <Link href="/support/new">
                <Plus className="me-1.5 h-4 w-4" /> {t('dashboard.emptyCta')}
              </Link>
            </Button>
          </EmptyState>
        ) : (
          tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/${ticket.id}`} className="block">
              <Card className="p-4 transition-colors hover:border-primary/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        #{ticket.number}
                      </span>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <h3 dir="auto" className="mt-1 truncate font-medium">
                      {ticket.subject}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <CategoryBadge category={ticket.category} />
                      <PriorityBadge priority={ticket.priority} />
                      {ticket.projectTitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          · {ticket.projectTitle}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-end text-xs text-muted-foreground">
                    <div>{timeAgo(ticket.lastMessageAt ?? ticket.createdAt)}</div>
                    <div className="mt-1">
                      {t('dashboard.messages', { n: ticket.messageCount })}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
