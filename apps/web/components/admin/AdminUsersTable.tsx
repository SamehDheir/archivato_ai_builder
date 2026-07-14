'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import type { AdminUserRow, UserAiSpend } from '@archivato/shared';
import { adminApi, authApi } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { useToast } from '@/components/shared/toast';
import { UserAvatar } from '@/components/shared/UserAvatar';

const PAGE_SIZE = 20;

/**
 * What one user has cost us in model calls, rendered next to what they pay us.
 *
 * Three states, and the difference between them matters more than the number:
 *  - never called a model      → a plain `$0.00` (they genuinely cost nothing);
 *  - every call on an unpriced → `—`, because a confident `$0.00` next to real
 *    model  (unlisted model)     token burn is the one lie this feature can tell;
 *  - some calls unpriced       → the cost with a `*`, marking it as a FLOOR.
 */
function AiSpendCell({ spend }: { spend: UserAiSpend }) {
  const { t } = useTranslation('admin');
  const fmt = useFormat();

  const unknown = spend.unpricedCalls > 0 && spend.unpricedCalls === spend.calls;
  const partial = spend.unpricedCalls > 0 && !unknown;

  return (
    <span
      className="tabular-nums"
      dir="ltr"
      title={
        spend.unpricedCalls > 0
          ? t('users.aiSpendUnpriced', { n: fmt.number(spend.unpricedCalls) })
          : t('users.aiSpendCalls', { n: fmt.number(spend.calls) })
      }
    >
      {unknown ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <>
          {fmt.usd(spend.costUsd)}
          {partial && '*'}
        </>
      )}
    </span>
  );
}

/** The admin users table: plan + project count per user, with role + delete actions. */
export function AdminUsersTable() {
  const confirm = useConfirm();
  const toast = useToast();
  const { t } = useTranslation('admin');
  const fmt = useFormat();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [meId, setMeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await adminApi.users(p, PAGE_SIZE);
      setRows(res.users);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    authApi.me().then((u) => setMeId(u?.id ?? null)).catch(() => undefined);
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  async function toggleRole(u: AdminUserRow) {
    const makeAdmin = u.role !== 'admin';
    const ok = await confirm({
      title: makeAdmin ? t('users.makeAdminTitle') : t('users.revokeTitle'),
      description: makeAdmin
        ? t('users.makeAdminDesc', { email: u.email })
        : t('users.revokeDesc', { email: u.email }),
      confirmLabel: makeAdmin ? t('users.makeAdminConfirm') : t('users.revokeConfirm'),
      destructive: !makeAdmin,
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      await adminApi.setRole(u.id, makeAdmin ? 'admin' : 'user');
      setRows((rs) =>
        rs.map((r) => (r.id === u.id ? { ...r, role: makeAdmin ? 'admin' : 'user' } : r)),
      );
      toast({ title: t('users.roleUpdated'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('users.roleFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(u: AdminUserRow) {
    const ok = await confirm({
      title: t('users.deleteTitle'),
      description: t('users.deleteDesc', { email: u.email, count: u.projectCount }),
      confirmLabel: t('users.deleteConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      await adminApi.deleteUser(u.id);
      toast({ title: t('users.userDeleted'), variant: 'success' });
      // Reload the page (counts shift); step back if we emptied the last page.
      const nextTotal = total - 1;
      const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE));
      const target = Math.min(page, lastPage);
      if (target !== page) setPage(target);
      else void load(page);
    } catch (e) {
      toast({
        title: t('users.deleteFailed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // The server nulls `aiSpend` for a caller without `admin:analytics`; when it
  // does, the column has nothing to say and shouldn't take up space.
  const showSpend = rows.some((u) => u.aiSpend !== null);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {t('users.title')} <span className="text-muted-foreground">({total})</span>
          </h3>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {loading && rows.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.col.user')}</TableHead>
                <TableHead>{t('users.col.role')}</TableHead>
                <TableHead>{t('users.col.plan')}</TableHead>
                <TableHead className="text-end">{t('users.col.projects')}</TableHead>
                {showSpend && (
                  <TableHead className="text-end" title={t('users.aiSpendHint')}>
                    {t('users.col.aiSpend')}
                  </TableHead>
                )}
                <TableHead>{t('users.col.joined')}</TableHead>
                <TableHead className="text-end">{t('users.col.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => {
                const isSelf = u.id === meId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          name={u.displayName}
                          src={u.avatarUrl}
                          size={32}
                        />
                        <div className="min-w-0">
                          <div className="font-medium" dir="auto">
                            {u.displayName}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span dir="ltr">{u.email}</span>
                            {!u.emailVerified && (
                              <Badge variant="warning" className="text-[9px]">
                                {t('users.unverified')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'primary' : 'secondary'}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.plan === 'pro' ? 'default' : 'outline'}>
                        {u.plan}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {u.projectCount}
                    </TableCell>
                    {showSpend && (
                      <TableCell className="text-end font-medium">
                        {u.aiSpend && <AiSpendCell spend={u.aiSpend} />}
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">
                      {fmt.date(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isSelf || busyId === u.id}
                          onClick={() => toggleRole(u)}
                          title={isSelf ? t('users.cannotChangeOwnRole') : undefined}
                        >
                          {u.role === 'admin' ? t('users.revoke') : t('users.makeAdmin')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={isSelf || busyId === u.id}
                          onClick={() => remove(u)}
                          aria-label={t('users.deleteUser')}
                          title={isSelf ? t('users.cannotDeleteSelf') : t('users.deleteUser')}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('users.page', { page, pages })}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('users.previous')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pages || loading}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                {t('users.next')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
