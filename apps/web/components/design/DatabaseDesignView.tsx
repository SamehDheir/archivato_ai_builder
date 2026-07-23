'use client';

import { useTranslation } from 'react-i18next';
import { AlertTriangle, Share2, Table2, Workflow } from 'lucide-react';
import { type DatabaseDesign, type EntityColumn } from '@archivato/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArtifactDownload } from '@/components/shared/ArtifactDownload';
import {
  databaseDesignToPrisma,
  databaseDesignToSql,
} from '@/lib/database-export';
import { ErDiagram } from '@/components/design/ErDiagram';
import { Empty, Section } from '@/components/design/RequirementDocumentView';

export function DatabaseDesignView({ design }: { design: DatabaseDesign }) {
  const { t } = useTranslation('stages');
  // Owner-only: the share payload never carries it (stripped in ShareService).
  const sharedEntityNotices = design.sharedEntityNotices ?? [];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('database.meta', {
            type: design.databaseType,
            date: new Date(design.generatedAt).toLocaleString(),
          })}
        </p>
        <ArtifactDownload
          basename={`database-design-${design.sessionId}`}
          formats={[
            {
              label: 'Prisma',
              ext: 'prisma',
              mime: 'text/plain',
              build: () => databaseDesignToPrisma(design),
            },
            {
              label: 'JSON',
              ext: 'json',
              mime: 'application/json',
              build: () => JSON.stringify(design, null, 2),
            },
            {
              label: 'SQL',
              ext: 'sql',
              mime: 'application/sql',
              build: () => databaseDesignToSql(design),
            },
          ]}
        />
      </div>

      {sharedEntityNotices.length > 0 && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle aria-hidden />
          <AlertTitle>{t('database.sharedEntities.title')}</AlertTitle>
          <AlertDescription>
            <p>{t('database.sharedEntities.body')}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5">
              {sharedEntityNotices.map((notice) => (
                <li key={notice} dir="auto">
                  {notice}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Section title={t('database.erd')} icon={Workflow}>
        {design.entities.length ? (
          <ErDiagram design={design} basename={`erd-${design.sessionId}`} />
        ) : (
          <Empty />
        )}
      </Section>

      <Section title={t('database.entities')} icon={Table2}>
        <div className="grid gap-3 sm:grid-cols-2">
          {design.entities.map((entity) => (
            <Card key={entity.name}>
              <CardContent className="p-4">
                <div className="font-mono text-sm font-semibold">
                  {entity.name}
                </div>
                <p className="text-sm text-muted-foreground" dir="auto">
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

      <Section title={t('database.relations')} icon={Share2}>
        {design.relations.length ? (
          <ul className="space-y-1.5 text-sm">
            {design.relations.map((r, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{r.from}</span>{' '}
                <Badge variant="muted">{r.type}</Badge>{' '}
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
  const { t } = useTranslation('stages');
  const badges: { label: string; variant: 'warning' | 'primary' | 'secondary' }[] =
    [];
  if (col.primaryKey)
    badges.push({ label: t('database.badge.pk'), variant: 'warning' });
  if (col.references)
    badges.push({
      label: t('database.badge.fk', { entity: col.references.entity }),
      variant: 'primary',
    });
  if (col.unique)
    badges.push({ label: t('database.badge.unique'), variant: 'secondary' });
  if (!col.nullable && !col.primaryKey)
    badges.push({ label: t('database.badge.notNull'), variant: 'secondary' });
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
