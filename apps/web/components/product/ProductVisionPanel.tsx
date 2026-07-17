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
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    try {
      setVision(await productVisionApi.generate(sessionId));
      toast({ title: t('vision.generatedToast'), variant: 'success' });
    } catch (e) {
      toast({
        title: t('vision.failed'),
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

  if (!vision) {
    return (
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
      <ProductVisionView vision={vision} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? t('vision.working') : t('vision.regenerate')}
      </Button>
    </div>
  );
}
