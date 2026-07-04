'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import type { CostEstimate } from '@archivato/shared';
import { costEstimateApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { CostView } from '@/components/cost/CostView';
import { useToast } from '@/components/shared/toast';

/**
 * The Cost Estimator tab. Standalone: fetches its own artifact and can
 * generate/regenerate it from the generated design (gated server-side on the API
 * design existing). It does not gate the design pipeline.
 */
export function CostEstimatePanel({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
}) {
  const toast = useToast();
  const { t } = useTranslation('stages');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEstimate(await costEstimateApi.get(sessionId));
    } catch {
      setEstimate(null); // 404 = not generated yet
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
      setEstimate(await costEstimateApi.generate(sessionId));
      toast({ title: t('cost.generatedToast'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('cost.failed'),
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

  if (!estimate) {
    return (
      <EmptyState
        icon={Coins}
        title={t('cost.emptyTitle')}
        description={t('cost.emptyDescription')}
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? t('cost.working') : t('cost.generate')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <CostView estimate={estimate} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('cost.working') : t('cost.regenerate')}
      </Button>
    </div>
  );
}
