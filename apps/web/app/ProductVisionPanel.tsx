'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ProductVision } from '@archivato/shared';
import { productVisionApi } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from './EmptyState';
import { ProductVisionView } from './ProductVisionView';
import { useToast } from './toast';

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
      toast({ title: 'Product vision generated', variant: 'success' });
    } catch (e) {
      toast({
        title: 'Could not generate the product vision',
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

  if (!vision) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Frame the product"
        description="Turn the interview into a product strategy: a north-star vision, strategic goals, a lean MVP vs. a future roadmap, success metrics, and user personas."
      >
        <Button onClick={generate} disabled={busy}>
          {busy ? 'Working…' : 'Generate Product Vision'}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <ProductVisionView vision={vision} />
      <Button variant="secondary" onClick={generate} disabled={busy}>
        {busy ? 'Working…' : 'Regenerate'}
      </Button>
    </div>
  );
}
