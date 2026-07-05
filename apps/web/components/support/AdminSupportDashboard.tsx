'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, AlertTriangle } from 'lucide-react';
import type {
  SupportAdminStats,
  SupportCategory,
  SupportPriority,
  SupportTicketStatus,
  SupportTicketSummary,
} from '@archivato/shared';
import { supportAdminApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CATEGORIES,
  CategoryBadge,
  PRIORITIES,
  PriorityBadge,
  STATUSES,
  StatusBadge,
  useSupportMeta,
} from '@/components/support/support-meta';

const ALL = 'all';

export function AdminSupportDashboard() {
  const router = useRouter();
  const { t, statusLabel, priorityLabel, categoryLabel, timeAgo, formatDuration } =
    useSupportMeta();
  const [stats, setStats] = useState<SupportAdminStats | null>(null);
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus | typeof ALL>(ALL);
  const [priority, setPriority] = useState<SupportPriority | typeof ALL>(ALL);
  const [category, setCategory] = useState<SupportCategory | typeof ALL>(ALL);

  const loadList = useCallback(async () => {
    const res = await supportAdminApi.list({
      search: search || undefined,
      status: status === ALL ? undefined : status,
      priority: priority === ALL ? undefined : priority,
      category: category === ALL ? undefined : category,
      pageSize: 50,
    });
    setTickets(res.tickets);
  }, [search, status, priority, category]);

  useEffect(() => {
    supportAdminApi
      .stats()
      .then(setStats)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadList().catch(() => undefined), 250);
    return () => clearTimeout(timer);
  }, [loadList]);

  const tiles = stats
    ? [
        { label: t('admin.tileOpen'), value: stats.openTickets, tone: '' },
        { label: t('admin.tileInProgress'), value: stats.inProgress, tone: '' },
        { label: t('admin.tileWaitingCustomer'), value: stats.waitingCustomer, tone: '' },
        { label: t('admin.tileWaitingAdmin'), value: stats.waitingAdmin, tone: 'text-warning' },
        { label: t('admin.tileCritical'), value: stats.critical, tone: 'text-destructive' },
        { label: t('admin.tileUnassigned'), value: stats.unassigned, tone: 'text-warning' },
        { label: t('admin.tileResolved'), value: stats.resolved, tone: 'text-success' },
        { label: t('admin.tileClosed'), value: stats.closed, tone: 'text-muted-foreground' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))
          : tiles.map((tile) => (
              <Card key={tile.label} className="p-4">
                <div className={`text-2xl font-bold ${tile.tone}`}>{tile.value}</div>
                <div className="text-xs text-muted-foreground">{tile.label}</div>
              </Card>
            ))}
      </div>

      {/* SLA */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              {t('admin.avgFirstResponse')}
            </div>
            <div className="text-xl font-semibold">
              {formatDuration(stats.avgFirstResponseMs)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              {t('admin.avgResolution')}
            </div>
            <div className="text-xl font-semibold">
              {formatDuration(stats.avgResolutionMs)}
            </div>
          </Card>
        </div>
      )}

      {/* AI-flagged critical */}
      {stats && stats.aiFlaggedCritical.length > 0 && (
        <Card className="border-destructive/30 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> {t('admin.needsAttention')}
          </div>
          <div className="space-y-1.5">
            {stats.aiFlaggedCritical.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => router.push(`/support/admin/${ticket.id}`)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-start text-sm hover:bg-muted/50"
              >
                <PriorityBadge priority={ticket.priority} />
                <span className="min-w-0 flex-1 truncate">
                  #{ticket.number} {ticket.subject}
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(ticket.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.searchPlaceholder')}
            className="ps-8"
          />
        </div>
        <FilterSelect
          value={status}
          onChange={(v) => setStatus(v as SupportTicketStatus | typeof ALL)}
          allLabel={t('admin.allStatuses')}
          options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
        />
        <FilterSelect
          value={priority}
          onChange={(v) => setPriority(v as SupportPriority | typeof ALL)}
          allLabel={t('admin.allPriorities')}
          options={PRIORITIES.map((p) => ({ value: p, label: priorityLabel(p) }))}
        />
        <FilterSelect
          value={category}
          onChange={(v) => setCategory(v as SupportCategory | typeof ALL)}
          allLabel={t('admin.allCategories')}
          options={CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
        />
      </div>

      {/* All tickets */}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.colNumber')}</TableHead>
              <TableHead>{t('admin.colSubject')}</TableHead>
              <TableHead>{t('admin.colStatus')}</TableHead>
              <TableHead>{t('admin.colPriority')}</TableHead>
              <TableHead>{t('admin.colCategory')}</TableHead>
              <TableHead>{t('admin.colAssignee')}</TableHead>
              <TableHead>{t('admin.colUpdated')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow
                key={ticket.id}
                className="cursor-pointer"
                onClick={() => router.push(`/support/admin/${ticket.id}`)}
              >
                <TableCell className="text-muted-foreground">{ticket.number}</TableCell>
                <TableCell dir="auto" className="max-w-[240px] truncate font-medium">
                  {ticket.subject}
                </TableCell>
                <TableCell>
                  <StatusBadge status={ticket.status} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={ticket.priority} />
                </TableCell>
                <TableCell>
                  <CategoryBadge category={ticket.category} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {ticket.assigneeName ?? '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {timeAgo(ticket.lastMessageAt ?? ticket.createdAt)}
                </TableCell>
              </TableRow>
            ))}
            {tickets.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {t('admin.noMatches')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
