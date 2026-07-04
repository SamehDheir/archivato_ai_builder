'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import type { ProjectRoadmap } from '@archivato/shared';
import { roadmapApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { RoadmapView } from '@/components/roadmap/RoadmapView';
import { useToast } from '@/components/shared/toast';

/**
 * The Roadmap Planner tab. Standalone: fetches its own artifact and can
 * generate/regenerate it from the full generated pipeline (gated server-side on
 * the API design existing). It does not gate the design pipeline.
 */
export function RoadmapPanel({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
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
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
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
      <RoadmapView roadmap={roadmap} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('roadmap.working') : t('roadmap.regenerate')}
      </Button>
    </div>
  );
}
