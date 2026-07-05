'use client';

import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type SupportCategory,
  type SupportPriority,
  type SupportTicketStatus,
} from '@archivato/shared';
import { Badge } from '@/components/ui/badge';

type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'primary'
  | 'destructive'
  | 'warning'
  | 'outline';

const STATUS_VARIANT: Record<SupportTicketStatus, BadgeVariant> = {
  open: 'primary',
  in_progress: 'primary',
  waiting_customer: 'warning',
  waiting_admin: 'warning',
  resolved: 'default',
  closed: 'secondary',
};

const PRIORITY_VARIANT: Record<SupportPriority, BadgeVariant> = {
  low: 'secondary',
  medium: 'outline',
  high: 'warning',
  critical: 'destructive',
};

export const STATUSES = SUPPORT_STATUSES;
export const PRIORITIES = SUPPORT_PRIORITIES;
export const CATEGORIES = SUPPORT_CATEGORIES;

/**
 * Localized labels + relative-time/duration formatters bound to the `support`
 * namespace. Time keys use `{{n}}`/`{{value}}` (not `count`) so no CLDR plural
 * resolution is triggered — Arabic just needs the single string (see CLAUDE.md).
 */
export function useSupportMeta() {
  const { t } = useTranslation('support');
  return {
    t,
    statusLabel: (s: SupportTicketStatus) => t(`status.${s}`),
    priorityLabel: (p: SupportPriority) => t(`priority.${p}`),
    categoryLabel: (c: SupportCategory) => t(`category.${c}`),
    timeAgo: (iso: string) => relativeTime(iso, t),
    formatDuration: (ms: number | null) => duration(ms, t),
    eventLabel: (type: string) => t(`event.${type}`, type),
  };
}

export function StatusBadge({ status }: { status: SupportTicketStatus }) {
  const { statusLabel } = useSupportMeta();
  return <Badge variant={STATUS_VARIANT[status]}>{statusLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: SupportPriority }) {
  const { priorityLabel } = useSupportMeta();
  return (
    <Badge variant={PRIORITY_VARIANT[priority]}>{priorityLabel(priority)}</Badge>
  );
}

export function CategoryBadge({ category }: { category: SupportCategory }) {
  const { categoryLabel } = useSupportMeta();
  return <Badge variant="outline">{categoryLabel(category)}</Badge>;
}

/** Compact relative-ish timestamp ("just now", "3h ago", or a date). */
function relativeTime(iso: string, t: TFunction): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minute', { n: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t('time.hour', { n: hr });
  const day = Math.round(hr / 24);
  if (day < 7) return t('time.day', { n: day });
  return new Date(iso).toLocaleDateString();
}

/** Human duration from milliseconds (SLA metrics). */
function duration(ms: number | null, t: TFunction): string {
  if (ms == null) return t('duration.none');
  const min = Math.round(ms / 60000);
  if (min < 60) return t('duration.minutes', { n: min });
  const hr = min / 60;
  if (hr < 24) return t('duration.hours', { value: hr.toFixed(1) });
  return t('duration.days', { value: (hr / 24).toFixed(1) });
}
