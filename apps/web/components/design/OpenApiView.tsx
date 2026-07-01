'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { exportApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// Swagger UI touches `window` and ships a large bundle, so load it client-only
// and code-split. The CSS is imported lazily inside the loader (below) so it
// never lands in the global First-Load CSS.
const SwaggerUI = dynamic(() => import('./SwaggerUiClient'), {
  ssr: false,
  loading: () => (
    <p className="text-sm text-muted-foreground">Loading API explorer…</p>
  ),
});

/**
 * Renders the project's generated OpenAPI 3.0 spec as interactive Swagger UI,
 * on-site (no download needed). The spec object is fetched with credentials and
 * passed directly to Swagger UI, so there's no second unauthenticated request.
 */
export function OpenApiView({
  sessionId,
  reloadKey,
}: {
  sessionId: string;
  reloadKey: number;
}) {
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSpec(await exportApi.openapi(sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!spec)
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-72 w-full" />
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Interactive OpenAPI 3.0 docs generated from the API design.
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <SwaggerUI spec={spec} />
      </div>
    </div>
  );
}
