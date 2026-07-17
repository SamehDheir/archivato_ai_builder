'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import type { ThreatModel, UpstreamRevisions } from '@archivato/shared';
import { threatModelApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ArtifactSkeleton } from '@/components/shared/ArtifactSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ThreatModelView } from '@/components/security/ThreatModelView';
import { StaleNotice } from '@/components/project/StaleNotice';
import { useToast } from '@/components/shared/toast';

/**
 * The Threat Modeler tab. Standalone: fetches its own artifact and can
 * generate/regenerate the STRIDE model from the full generated pipeline (gated
 * server-side on Pro + the API design existing). It does not gate the pipeline.
 */
export function ThreatModelPanel({
  sessionId,
  reloadKey,
  revisions,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
  /** Current design revisions — a model of an older design is stale. */
  revisions: UpstreamRevisions;
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
    return <ArtifactSkeleton />;
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
      <StaleNotice
        stage="threat-model"
        artifact={model}
        revisions={revisions}
        busy={busy}
        onRegenerate={generate}
      />
      <ThreatModelView model={model} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('threat.working') : t('threat.regenerate')}
      </Button>
    </div>
  );
}
