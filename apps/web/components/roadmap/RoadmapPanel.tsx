'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import type { ProjectRoadmap, UpstreamRevisions } from '@archivato/shared';
import { roadmapApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ArtifactSkeleton } from '@/components/shared/ArtifactSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { RoadmapView } from '@/components/roadmap/RoadmapView';
import { StaleNotice } from '@/components/project/StaleNotice';
import { useToast } from '@/components/shared/toast';

/**
 * The Roadmap Planner tab. Standalone: fetches its own artifact and can
 * generate/regenerate it from the full generated pipeline (gated server-side on
 * the API design existing). It does not gate the design pipeline.
 */
export function RoadmapPanel({
  sessionId,
  reloadKey,
  revisions,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
  /** Current design revisions — a roadmap built from an older one is stale. */
  revisions: UpstreamRevisions;
}) {
  const toast = useToast();
  const { t } = useTranslation('stages');
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoadmap(await roadmapApi.get(sessionId));
    } catch {
      setRoadmap(null); // 404 = not generated yet
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
      setRoadmap(await roadmapApi.generate(sessionId));
      toast({ title: t('roadmap.generated'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('roadmap.failed'),
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

  if (!roadmap) {
    return (
      <EmptyState
        icon={Flag}
        title={t('roadmap.emptyTitle')}
        description={t('roadmap.emptyDescription')}
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? t('roadmap.working') : t('roadmap.generate')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <StaleNotice
        stage="roadmap"
        artifact={roadmap}
        revisions={revisions}
        busy={busy}
        onRegenerate={generate}
      />
      <RoadmapView roadmap={roadmap} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('roadmap.working') : t('roadmap.regenerate')}
      </Button>
    </div>
  );
}
