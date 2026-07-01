import { Package } from 'lucide-react';
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
  const endpointCount = design.modules.reduce(
    (n, m) => n + m.endpoints.length,
    0,
  );
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {design.modules.length} modules · {endpointCount} endpoints · generated{' '}
          {new Date(design.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`api-design-${design.sessionId}.json`}
          data={design}
          label="Download API design"
        />
      </div>

      {design.modules.map((module) => (
        <div className="mt-5" key={module.name}>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 text-muted-foreground" />
            {module.name}
            <span className="font-mono text-xs text-muted-foreground">
              {module.basePath}
            </span>
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

function EndpointRow({ endpoint }: { endpoint: ApiEndpoint }) {
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
        <span className="ml-auto flex flex-wrap gap-1">
          {endpoint.statusCodes.map((c) => (
            <Badge variant="secondary" key={c}>
              {c}
            </Badge>
          ))}
        </span>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{endpoint.summary}</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <SchemaList label="Request" fields={endpoint.requestSchema} />
        <SchemaList label="Response" fields={endpoint.responseSchema} />
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
