'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ProjectSnapshot,
  ProjectVersionMeta,
} from '@archivato/shared';
import { versionsApi } from '@/lib/api';
import { useFormat } from '@/lib/i18n/format';
import { useConfirm } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type DiffRow = { left?: string; right?: string; type: 'same' | 'add' | 'del' };

export function VersionHistory({
  sessionId,
  reloadKey,
  onRestored,
}: {
  sessionId: string;
  /** Bump to reload the list after a generation / refinement / restore. */
  reloadKey: number;
  onRestored: (snapshot: ProjectSnapshot) => void;
}) {
  const [versions, setVersions] = useState<ProjectVersionMeta[]>([]);
  const [fromV, setFromV] = useState<number | null>(null);
  const [toV, setToV] = useState<number | null>(null);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const { t } = useTranslation('stages');
  const fmt = useFormat();

  const load = useCallback(async () => {
    try {
      const list = await versionsApi.list(sessionId);
      setVersions(list);
      // Default the compare range to (previous → latest).
      setToV((prev) => prev ?? list[0]?.version ?? null);
      setFromV((prev) => prev ?? list[1]?.version ?? list[0]?.version ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function compare() {
    if (fromV == null || toV == null) return;
    setBusy(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([
        versionsApi.get(sessionId, fromV),
        versionsApi.get(sessionId, toV),
      ]);
      setDiff(diffLines(pretty(a.snapshot), pretty(b.snapshot)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function restore(version: number) {
    const ok = await confirm({
      title: t('versions.restoreTitle', { version }),
      description: t('versions.restoreDescription'),
      confirmLabel: t('versions.restoreConfirm'),
      cancelLabel: t('versions.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await versionsApi.restore(sessionId, version);
      onRestored(snapshot);
      setDiff(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('versions.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('versions.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('versions.empty')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Version history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Badge variant="secondary">v{v.version}</Badge>
                <span className="truncate text-sm" title={v.label} dir="auto">
                  {v.label}
                </span>
              </span>
              <span className="flex items-center gap-3 whitespace-nowrap">
                <span className="text-xs text-muted-foreground">
                  {fmt.dateTime(v.createdAt)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restore(v.version)}
                  disabled={busy}
                >
                  {t('versions.restore')}
                </Button>
              </span>
            </li>
          ))}
        </ul>

        {versions.length > 1 && (
          <div className="flex flex-wrap items-end gap-2">
            <VersionPicker
              label={t('versions.compare')}
              value={fromV}
              versions={versions}
              onChange={setFromV}
            />
            <span className="pb-2 text-muted-foreground rtl:-scale-x-100">→</span>
            <VersionPicker
              label={t('versions.with')}
              value={toV}
              versions={versions}
              onChange={setToV}
            />
            <Button onClick={compare} disabled={busy || fromV === toV}>
              {busy ? t('versions.comparing') : t('versions.compareBtn')}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {diff && (
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-2 border-b border-border bg-muted/40 text-xs font-semibold">
              <div className="px-3 py-1.5">v{fromV}</div>
              <div className="border-s border-border px-3 py-1.5">v{toV}</div>
            </div>
            {/*
              `dir="ltr"`: these panes render the artifact's JSON, which is code.
              On an Arabic page they inherit RTL, and bidi then reorders every
              line that mixes braces, quotes and Latin keys — a diff whose
              punctuation has migrated to the wrong end is unreadable, and this is
              the one view whose entire job is letting someone compare two texts
              character by character. Same rule as email/path/table-name fields.
            */}
            <div
              dir="ltr"
              className="max-h-96 overflow-auto font-mono text-xs leading-5"
            >
              {diff.map((row, i) => (
                <div key={i} className="grid grid-cols-2">
                  <pre
                    className={`whitespace-pre-wrap break-all px-3 ${
                      row.type === 'del' ? 'bg-destructive/15' : ''
                    }`}
                  >
                    {row.left ?? ''}
                  </pre>
                  <pre
                    className={`whitespace-pre-wrap break-all border-s border-border px-3 ${
                      row.type === 'add' ? 'bg-primary/15' : ''
                    }`}
                  >
                    {row.right ?? ''}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VersionPicker({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: number | null;
  versions: ProjectVersionMeta[];
  onChange: (version: number) => void;
}) {
  const { t } = useTranslation('stages');
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <Select
        value={value != null ? String(value) : undefined}
        onValueChange={(v) => onChange(Number(v))}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder={t('versions.version')} />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.id} value={String(v.version)}>
              <span dir="auto">
                v{v.version} · {v.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function pretty(snapshot: ProjectSnapshot): string[] {
  return JSON.stringify(snapshot, null, 2).split('\n');
}

/** Classic LCS line diff → aligned rows for a two-column view. */
function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ left: a[i], right: b[j], type: 'same' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: a[i], type: 'del' });
      i++;
    } else {
      rows.push({ right: b[j], type: 'add' });
      j++;
    }
  }
  while (i < n) rows.push({ left: a[i++], type: 'del' });
  while (j < m) rows.push({ right: b[j++], type: 'add' });
  return rows;
}
