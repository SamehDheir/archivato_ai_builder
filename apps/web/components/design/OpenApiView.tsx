'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { exportApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** API origin (with the /api prefix) the mock server lives on. */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

/** Loading fallback for the code-split Swagger bundle. */
function SwaggerLoading() {
  const { t } = useTranslation('stages');
  return <p className="text-sm text-muted-foreground">{t('apidocs.loading')}</p>;
}

// Swagger UI touches `window` and ships a large bundle, so load it client-only
// and code-split. The CSS is imported lazily inside the loader (below) so it
// never lands in the global First-Load CSS.
const SwaggerUI = dynamic(() => import('./SwaggerUiClient'), {
  ssr: false,
  loading: () => <SwaggerLoading />,
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
  const { t } = useTranslation('stages');
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const doc = await exportApi.openapi(sessionId);
      // Point "Try it out" at the backend mock server, which returns
      // schema-derived example responses for the designed endpoints.
      doc.servers = [
        {
          url: `${API_BASE}/export/${sessionId}/mock`,
          description: 'Mock server — example responses',
        },
      ];
      setSpec(doc);
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
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t('apidocs.intro')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            {t('apidocs.tryNote')}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          {t('apidocs.refresh')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <SwaggerUI spec={spec} />
      </div>
    </div>
  );
}
