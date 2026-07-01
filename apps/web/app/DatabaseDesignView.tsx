'use client';

import { Share2, Table2, Workflow } from 'lucide-react';
import { buildErd, type DatabaseDesign, type EntityColumn } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DownloadButton } from './DownloadButton';
import { MermaidView } from './MermaidView';
import { Empty, Section } from './RequirementDocumentView';

export function DatabaseDesignView({ design }: { design: DatabaseDesign }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {design.databaseType} · generated{' '}
          {new Date(design.generatedAt).toLocaleString()}
        </p>
        <DownloadButton
          filename={`database-design-${design.sessionId}.json`}
          data={design}
          label="Download schema"
        />
      </div>

      <Section title="ER Diagram" icon={Workflow}>
        {design.entities.length ? (
          <MermaidView code={buildErd(design)} />
        ) : (
          <Empty />
        )}
      </Section>

      <Section title="Entities" icon={Table2}>
        <div className="grid gap-3 sm:grid-cols-2">
          {design.entities.map((entity) => (
            <Card key={entity.name}>
              <CardContent className="p-4">
                <div className="font-mono text-sm font-semibold">
                  {entity.name}
                </div>
                <p className="text-sm text-muted-foreground">
                  {entity.description}
                </p>
                <ul className="mt-2 space-y-1">
                  {entity.columns.map((col) => (
                    <li
                      key={col.name}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                    >
                      <span className="font-mono text-xs">{col.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {col.type}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        <ColumnBadges col={col} />
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Relations" icon={Share2}>
        {design.relations.length ? (
          <ul className="space-y-1.5 text-sm">
            {design.relations.map((r, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{r.from}</span>{' '}
                <Badge variant="secondary">{r.type}</Badge>{' '}
                <span className="font-mono text-xs">{r.to}</span>
                {r.description && (
                  <span className="text-muted-foreground"> — {r.description}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Section>
    </div>
  );
}

function ColumnBadges({ col }: { col: EntityColumn }) {
  const badges: { label: string; variant: 'warning' | 'primary' | 'secondary' }[] =
    [];
  if (col.primaryKey) badges.push({ label: 'PK', variant: 'warning' });
  if (col.references)
    badges.push({ label: `FK → ${col.references.entity}`, variant: 'primary' });
  if (col.unique) badges.push({ label: 'unique', variant: 'secondary' });
  if (!col.nullable && !col.primaryKey)
    badges.push({ label: 'not null', variant: 'secondary' });
  return (
    <>
      {badges.map((b) => (
        <Badge key={b.label} variant={b.variant}>
          {b.label}
        </Badge>
      ))}
    </>
  );
}
