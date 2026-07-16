'use client';

import { useTranslation } from 'react-i18next';
import { Package, ShieldQuestion, TriangleAlert } from 'lucide-react';
import type { ApiDesign, ApiEndpoint, SchemaField } from '@archivato/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DownloadButton } from '@/components/shared/DownloadButton';
import { Empty } from '@/components/design/RequirementDocumentView';

const METHOD_CLASS: Record<string, string> = {
  GET: 'text-success border-success/50',
  POST: 'text-primary border-primary/50',
  PUT: 'text-warning border-warning/50',
  PATCH: 'text-[#c084fc] border-[#c084fc]/50',
  DELETE: 'text-destructive border-destructive/50',
};

export function ApiDesignView({ design }: { design: ApiDesign }) {
  const { t } = useTranslation('stages');
  const endpointCount = design.modules.reduce(
    (n, m) => n + m.endpoints.length,
    0,
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('api.meta', {
            modules: design.modules.length,
            endpoints: endpointCount,
            date: new Date(design.generatedAt).toLocaleString(),
          })}
        </p>
        <DownloadButton
          filename={`api-design-${design.sessionId}.json`}
          data={design}
          label={t('api.download')}
        />
      </div>

      <CoverageSummary design={design} />

      {design.modules.map((module) => (
        <div className="mt-5" key={module.name}>
          <h4 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
            {module.name}
            <span className="font-mono text-xs text-muted-foreground" dir="ltr">
              {module.basePath}
            </span>
            {module.source === 'generated-fallback' && (
              <Badge variant="warning" className="gap-1 font-normal">
                <TriangleAlert className="h-3 w-3" />
                {t('api.coverage.fallback')}
              </Badge>
            )}
          </h4>
          <div className="space-y-2">
            {module.endpoints.map((ep, i) => (
              <EndpointRow key={i} endpoint={ep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * What the design does with every table it was given: how many entities have an
 * API, how many were deliberately left out, and why.
 *
 * Hidden entirely on a design generated before coverage accounting existed — it
 * has no claims to render, and "0 entities covered" would read as a broken API
 * rather than a missing field.
 */
function CoverageSummary({ design }: { design: ApiDesign }) {
  const { t } = useTranslation('stages');
  const covered = new Set(design.modules.flatMap((m) => m.coveredEntities ?? []));
  const excluded = design.excludedEntities ?? [];
  const declared = design.modules.some((m) => m.coveredEntities !== undefined);
  if (!declared && excluded.length === 0) return null;

  const needsReview = design.modules.filter(
    (m) => m.source === 'generated-fallback',
  ).length;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <ShieldQuestion className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">
          {t('api.coverage.summary', {
            covered: covered.size,
            excluded: excluded.length,
          })}
        </span>
        {needsReview > 0 && (
          <Badge variant="warning" className="gap-1 font-normal">
            <TriangleAlert className="h-3 w-3" />
            {t('api.coverage.needsReview', { n: needsReview })}
          </Badge>
        )}
      </div>

      {excluded.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {excluded.map((e) => (
            <li key={e.entity}>
              <span className="font-mono text-foreground" dir="ltr">
                {e.entity}
              </span>{' '}
              <span dir="auto">{e.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EndpointRow({ endpoint }: { endpoint: ApiEndpoint }) {
  const { t } = useTranslation('stages');
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'rounded border px-2 py-0.5 font-mono text-xs font-bold',
            METHOD_CLASS[endpoint.method] ?? 'text-foreground border-border',
          )}
        >
          {endpoint.method}
        </span>
        <span className="font-mono text-sm">{endpoint.path}</span>
        <span className="ms-auto flex flex-wrap gap-1">
          {(endpoint.statusCodes ?? []).map((c) => (
            <Badge variant="secondary" key={c}>
              {c}
            </Badge>
          ))}
        </span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground" dir="auto">
        {endpoint.summary}
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <SchemaList label={t('api.request')} fields={endpoint.requestSchema ?? []} />
        <SchemaList label={t('api.response')} fields={endpoint.responseSchema ?? []} />
      </div>
    </div>
  );
}

function SchemaList({ label, fields }: { label: string; fields: SchemaField[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {fields.length ? (
        <ul className="space-y-1 text-sm">
          {fields.map((f) => (
            <li key={f.name}>
              <span className="font-mono text-xs">{f.name}</span>{' '}
              <span className="text-xs text-muted-foreground">{f.type}</span>
              {f.required && <span className="text-destructive"> *</span>}
            </li>
          ))}
        </ul>
      ) : (
        <Empty />
      )}
    </div>
  );
}
