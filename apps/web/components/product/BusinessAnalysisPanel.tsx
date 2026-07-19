'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import type { BusinessAnalysis } from '@archivato/shared';
import { businessAnalysisApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ArtifactSkeleton } from '@/components/shared/ArtifactSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { BusinessAnalysisView } from '@/components/product/BusinessAnalysisView';
import { useToast } from '@/components/shared/toast';
import { GenerationNotice } from '@/components/project/GenerationNotice';

/**
 * The Business Analysis stage tab. Runs off the confirmed interview and feeds
 * the Requirement Engineer, but does not gate it — so this panel is reachable
 * the moment the interview is confirmed, and a project that never runs it still
 * generates requirements normally.
 */
export function BusinessAnalysisPanel({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
}) {
  const toast = useToast();
  const { t } = useTranslation('stages');
  const [analysis, setAnalysis] = useState<BusinessAnalysis | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAnalysis(await businessAnalysisApi.get(sessionId));
    } catch {
      setAnalysis(null); // 404 = not generated yet
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
      setAnalysis(await businessAnalysisApi.generate(sessionId));
      toast({ title: t('business.generatedToast'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('business.failed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <ArtifactSkeleton />;

  if (!analysis) {
    return (
      <EmptyState
        icon={Compass}
        title={t('business.emptyTitle')}
        description={t('business.emptyDescription')}
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? t('business.working') : t('business.generate')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <GenerationNotice
        generation={analysis.generation}
        busy={busy}
        onRegenerate={generate}
      />
      <BusinessAnalysisView analysis={analysis} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('business.working') : t('business.regenerate')}
      </Button>
    </div>
  );
}
