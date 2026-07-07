'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import type { ThreatModel } from '@archivato/shared';
import { threatModelApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ThreatModelView } from '@/components/security/ThreatModelView';
import { useToast } from '@/components/shared/toast';

/**
 * The Threat Modeler tab. Standalone: fetches its own artifact and can
 * generate/regenerate the STRIDE model from the full generated pipeline (gated
 * server-side on Pro + the API design existing). It does not gate the pipeline.
 */
export function ThreatModelPanel({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
}) {
  const toast = useToast();
  const { t } = useTranslation('stages');
  const [model, setModel] = useState<ThreatModel | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setModel(await threatModelApi.get(sessionId));
    } catch {
      setModel(null); // 404 = not generated yet
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
      setModel(await threatModelApi.generate(sessionId));
      toast({ title: t('threat.generated'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('threat.failed'),
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

  if (!model) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title={t('threat.emptyTitle')}
        description={t('threat.emptyDescription')}
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? t('threat.working') : t('threat.generate')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <ThreatModelView model={model} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('threat.working') : t('threat.regenerate')}
      </Button>
    </div>
  );
}
