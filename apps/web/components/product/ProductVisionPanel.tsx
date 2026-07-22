'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import type { ProductVision } from '@archivato/shared';
import { productVisionApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ArtifactSkeleton } from '@/components/shared/ArtifactSkeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ProductVisionView } from '@/components/product/ProductVisionView';
import { useToast } from '@/components/shared/toast';
import { GenerationNotice } from '@/components/project/GenerationNotice';
import { StreamingConsole } from '@/components/project/StreamingConsole';
import { useStreamedGeneration } from '@/lib/use-streamed-generation';

/**
 * The Product Manager stage tab. Standalone: fetches its own artifact and can
 * generate/regenerate it from the confirmed interview (it does not gate, and is
 * not gated by, the design pipeline).
 */
export function ProductVisionPanel({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  /** Bump to refetch (e.g. after a restore). */
  reloadKey: number;
}) {
  const toast = useToast();
  const { t } = useTranslation('stages');
  const [vision, setVision] = useState<ProductVision | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { busy, view, run } = useStreamedGeneration<ProductVision>(
    sessionId,
    'product-vision',
  );

  const load = useCallback(async () => {
    try {
      setVision(await productVisionApi.get(sessionId));
    } catch {
      setVision(null); // 404 = not generated yet
    } finally {
      setLoaded(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  async function generate() {
    try {
      setVision(await run());
      toast({ title: t('vision.generatedToast'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('vision.failed'),
        description: e instanceof Error ? e.message : String(e),
        variant: 'error',
      });
    }
  }

  if (!loaded) {
    return <ArtifactSkeleton />;
  }

  if (!vision) {
    return view ? (
      <StreamingConsole stage="product-vision" view={view} />
    ) : (
      <EmptyState
        icon={Sparkles}
        title={t('vision.emptyTitle')}
        description={t('vision.emptyDescription')}
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? t('vision.working') : t('vision.generate')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {view && <StreamingConsole stage="product-vision" view={view} />}
      <GenerationNotice generation={vision.generation} busy={busy} onRegenerate={generate} />
      <ProductVisionView vision={vision} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('vision.working') : t('vision.regenerate')}
      </Button>
    </div>
  );
}
