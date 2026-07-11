'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Mails, Search } from 'lucide-react';
import type { WaitlistAdminPage } from '@archivato/shared';
import { waitlistAdminApi } from '@/lib/api';
import { requirePermission, usePageAccess } from '@/lib/use-page-access';
import { useFormat } from '@/lib/i18n/format';
import { saveFile, toCsv } from '@/lib/download';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/shared/toast';

const PAGE_SIZE = 25;

/** The server clamps a page to this (`MAX_PAGE_SIZE`), so the export pages through. */
const EXPORT_PAGE_SIZE = 200;
/** Safety stop so a bad `total` can't spin the export forever. */
const MAX_EXPORT_PAGES = 500;

export default function WaitlistAdminPage() {
  // Super-admin only (same gate as the Roles console).
  const me = usePageAccess(requirePermission('admin:roles:manage'));
  const { t } = useTranslation('admin');
  const fmt = useFormat();
  const toast = useToast();

  const [data, setData] = useState<WaitlistAdminPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(
    (query: string, p: number) => {
      setLoading(true);
      waitlistAdminApi
        .list({ q: query || undefined, page: p, pageSize: PAGE_SIZE })
        .then(setData)
        .catch((e) =>
          toast({
            title: t('waitlist.loadFailed'),
            description: e instanceof Error ? e.message : String(e),
            variant: 'error',
          }),
        )
        .finally(() => setLoading(false));
    },
    [t, toast],
  );

  // Debounced reload on filter/page change (once the guard has admitted us).
  useEffect(() => {
    if (!me) return;
    const id = setTimeout(() => load(q, page), 250);
    return () => clearTimeout(id);
  }, [me, q, page, load]);

  /**
   * Export every signup matching the current filter — not just the page on
   * screen. The server caps a single page at 200, so walk the pages until we've
   * collected `total`; otherwise a list larger than one page would export
   * silently truncated (the KPI would say 1,500 and the file would hold 200).
   */
  async function exportCsv() {
    setExporting(true);
    try {
      const rows: WaitlistAdminPage['entries'] = [];
      let total = 0;
      for (let page = 1; page <= MAX_EXPORT_PAGES; page++) {
        const chunk = await waitlistAdminApi.list({
          q: q || undefined,
          page,
          pageSize: EXPORT_PAGE_SIZE,
        });
        total = chunk.total;
        rows.push(...chunk.entries);
        if (rows.length >= total || chunk.entries.length === 0) break;
      }
      const csv = toCsv(
        ['Email', 'Country', 'Locale', 'Source', 'Joined'],
        rows.map((e) => [
          e.email,
          e.country ?? '',
          e.locale ?? '',
          e.source ?? '',
          e.createdAt,
        ]),
      );
      saveFile(
        `waitlist-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
        'text/csv;charset=utf-8',
      );
    } catch (e) {
      toast({
        title: t('waitlist.exportFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setExporting(false);
    }
  }

  if (!me) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Mails className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">{t('waitlist.title')}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t('waitlist.subtitle')}</p>

      {/* KPI */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Mails className="h-4 w-4" /> {t('waitlist.kpi')}
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight" dir="ltr">
            {data ? fmt.number(data.total) : '—'}
          </div>
        </Card>
      </div>

      {/* Search + export */}
      <div className="mt-8 flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              dir="ltr"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t('waitlist.search')}
              className="ps-9"
            />
          </div>
        </div>
        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={exporting || !data || data.total === 0}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {t('waitlist.exportCsv')}
        </Button>
      </div>

      {/* Table */}
      {loading && !data ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      ) : !data || data.entries.length === 0 ? (
        <Card className="mt-4 p-8 text-center text-sm text-muted-foreground">
          {t('waitlist.empty')}
        </Card>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t('waitlist.col.email')}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t('waitlist.col.country')}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t('waitlist.col.locale')}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t('waitlist.col.source')}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t('waitlist.col.joined')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium" dir="ltr">
                      {e.email}
                    </td>
                    <td className="px-4 py-3" dir="auto">
                      {e.country ? (
                        <span title={e.country}>{fmt.country(e.country)}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t('waitlist.none')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.locale ? (
                        <Badge variant="secondary">{e.locale}</Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {t('waitlist.none')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="auto">
                      {e.source || t('waitlist.none')}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {fmt.dateTime(e.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{t('waitlist.count', { n: fmt.number(data.total) })}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('waitlist.page.prev')}
              </Button>
              <span>{t('waitlist.page.of', { page, pages: totalPages })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('waitlist.page.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
