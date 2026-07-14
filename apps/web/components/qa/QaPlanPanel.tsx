'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlaskConical } from 'lucide-react';
import type { QaPlan, UpstreamRevisions } from '@archivato/shared';
import { qaPlanApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { QaPlanView } from '@/components/qa/QaPlanView';
import { StaleNotice } from '@/components/project/StaleNotice';
import { useToast } from '@/components/shared/toast';

/**
 * The QA Planner tab. Standalone: fetches its own artifact and can
 * generate/regenerate the test plan from the full generated pipeline (gated
 * server-side on Pro + the API design existing). It does not gate the pipeline.
 */
export function QaPlanPanel({
  sessionId,
  reloadKey,
  revisions,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
  /** Current design revisions — a plan written against an older one is stale. */
  revisions: UpstreamRevisions;
}) {
  const toast = useToast();
  const { t } = useTranslation('stages');
  const [plan, setPlan] = useState<QaPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlan(await qaPlanApi.get(sessionId));
    } catch {
      setPlan(null); // 404 = not generated yet
    } finally {
      setLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function generate() {
    setBusy(true);
    try {
      setPlan(await qaPlanApi.generate(sessionId));
      toast({ title: t('qa.generated'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('qa.failed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!plan) {
    return (
      <EmptyState
        icon={FlaskConical}
        title={t('qa.emptyTitle')}
        description={t('qa.emptyDescription')}
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? t('qa.working') : t('qa.generate')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <StaleNotice
        stage="qa-plan"
        artifact={plan}
        revisions={revisions}
        busy={busy}
        onRegenerate={generate}
      />
      <QaPlanView plan={plan} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('qa.working') : t('qa.regenerate')}
      </Button>
    </div>
  );
}
