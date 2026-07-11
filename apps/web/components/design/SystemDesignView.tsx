'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Boxes, Layers, Network } from 'lucide-react';
import type { DecisionRef, SystemDesign } from '@archivato/shared';
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
import {
  DecisionExplainModal,
  ExplainButton,
} from '@/components/design/ExplainDecision';

export function SystemDesignView({
  design,
  interactive = true,
}: {
  design: SystemDesign;
  /**
   * Whether the "Explain this decision" buttons are shown. They call the API by
   * `design.sessionId`, so the read-only Example project (a static fixture with
   * no real session) passes `false` to hide them.
   */
  interactive?: boolean;
}) {
  const { t } = useTranslation('stages');
  // The decision the "Explain" modal is currently showing (null = closed).
  const [explaining, setExplaining] = useState<DecisionRef | null>(null);
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
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="primary">
            {t(`system.arch.${design.architecture}`, {
              defaultValue: design.architecture,
            })}
          </Badge>
          {interactive && (
            <ExplainButton
              onClick={() => setExplaining({ kind: 'architecture', key: '' })}
            />
          )}
        </div>
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
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {design.techStack.map((tech) => (
              <TableRow key={tech.layer + tech.technology}>
                <TableCell className="font-mono text-xs">{tech.layer}</TableCell>
                <TableCell className="font-medium">{tech.technology}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {tech.rationale}
                </TableCell>
                <TableCell className="text-end">
                  {interactive && (
                    <ExplainButton
                      onClick={() =>
                        setExplaining({ kind: 'tech', key: tech.layer })
                      }
                    />
                  )}
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
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold" dir="auto">{s.name}</div>
                  {interactive && (
                    <ExplainButton
                      onClick={() =>
                        setExplaining({ kind: 'service', key: s.name })
                      }
                    />
                  )}
                </div>
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

      {interactive && explaining && (
        <DecisionExplainModal
          sessionId={design.sessionId}
          decision={explaining}
          onClose={() => setExplaining(null)}
        />
      )}
    </div>
  );
}
