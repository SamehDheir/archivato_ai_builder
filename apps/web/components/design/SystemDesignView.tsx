'use client';

import { useTranslation } from 'react-i18next';
import { Boxes, Layers, Network } from 'lucide-react';
import type { SystemDesign } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArtifactDownload } from '@/components/shared/ArtifactDownload';
import { systemDesignToMarkdown } from '@/lib/artifact-markdown';
import { Section } from '@/components/design/RequirementDocumentView';

export function SystemDesignView({ design }: { design: SystemDesign }) {
  const { t } = useTranslation('stages');
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {t('system.generated', {
            date: new Date(design.generatedAt).toLocaleString(),
          })}
        </p>
        <ArtifactDownload
          basename={`system-design-${design.sessionId}`}
          formats={[
            {
              label: 'Markdown',
              ext: 'md',
              mime: 'text/markdown',
              build: () => systemDesignToMarkdown(design),
            },
            {
              label: 'JSON',
              ext: 'json',
              mime: 'application/json',
              build: () => JSON.stringify(design, null, 2),
            },
          ]}
        />
      </div>

      <Section title={t('system.architecture')} icon={Network} tone="blue">
        <Badge variant="primary">
          {t(`system.arch.${design.architecture}`, {
            defaultValue: design.architecture,
          })}
        </Badge>
        <p className="mt-1.5 text-sm text-muted-foreground" dir="auto">
          {design.architectureRationale}
        </p>
      </Section>

      <Section title={t('system.techStack')} icon={Layers} tone="violet">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{t('system.col.layer')}</TableHead>
              <TableHead>{t('system.col.technology')}</TableHead>
              <TableHead>{t('system.col.why')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {design.techStack.map((t) => (
              <TableRow key={t.layer + t.technology}>
                <TableCell className="font-mono text-xs">{t.layer}</TableCell>
                <TableCell className="font-medium">{t.technology}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.rationale}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title={t('system.services')} icon={Boxes} tone="emerald">
        <div className="grid gap-3 sm:grid-cols-2">
          {design.services.map((s) => (
            <Card key={s.name} className="border-l-2 border-l-emerald-500/60">
              <CardContent className="p-4">
                <div className="font-semibold" dir="auto">{s.name}</div>
                <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                  {s.responsibility}
                </p>
                {s.dependencies.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {t('system.dependsOn')}
                    {s.dependencies.map((d) => (
                      <Badge variant="secondary" key={d}>
                        {d}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
