'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Boxes,
  GitBranch,
  Layers,
  Network,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import type {
  BuildVsBuyItem,
  DecisionRef,
  ModuleComplexity,
  SystemDesign,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
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

/** t-shirt size → accent classes for the complexity chip. */
const COMPLEXITY_TONE: Record<ModuleComplexity, string> = {
  S: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  M: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  L: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  XL: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

function ComplexityBadge({
  complexity,
  rationale,
}: {
  complexity: ModuleComplexity;
  rationale?: string;
}) {
  return (
    <span
      title={rationale}
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-semibold',
        COMPLEXITY_TONE[complexity],
      )}
    >
      {complexity}
    </span>
  );
}

export function SystemDesignView({
  design,
  interactive = true,
  buildVsBuyFirst = false,
}: {
  design: SystemDesign;
  /**
   * Whether the "Explain this decision" buttons are shown. They call the API by
   * `design.sessionId`, so the read-only Example project (a static fixture with
   * no real session) passes `false` to hide them.
   */
  interactive?: boolean;
  /**
   * On the public share page the build-vs-buy plan leads (it's the most
   * client-comprehensible part of the technical appendix); on the owner page it
   * sits after the services.
   */
  buildVsBuyFirst?: boolean;
}) {
  const { t } = useTranslation('stages');
  // The decision the "Explain" modal is currently showing (null = closed).
  const [explaining, setExplaining] = useState<DecisionRef | null>(null);

  const buildVsBuy = design.buildVsBuy ?? [];
  const compliance = design.constraintCompliance ?? [];

  const buildVsBuySection = buildVsBuy.length > 0 && (
    <Section
      title={t('system.buildVsBuy.title')}
      count={buildVsBuy.length}
      icon={Scale}
      tone="amber"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">{t('system.buildVsBuy.capability')}</TableHead>
            <TableHead className="w-24">{t('system.buildVsBuy.decision')}</TableHead>
            <TableHead>{t('system.buildVsBuy.rationale')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buildVsBuy.map((item) => (
            <BuildVsBuyRow key={item.capability} item={item} />
          ))}
        </TableBody>
      </Table>
    </Section>
  );

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

      {buildVsBuyFirst && buildVsBuySection}

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

      {design.phasedArchitecture && (
        <Section title={t('system.phased.title')} icon={GitBranch} tone="cyan">
          <p className="mb-3 text-sm text-muted-foreground">
            {t('system.phased.lead')}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <PhaseCard
              label={t('system.phased.mvp')}
              body={design.phasedArchitecture.mvp}
            />
            <PhaseCard
              label={t('system.phased.growth')}
              body={design.phasedArchitecture.growthPath}
            />
            <PhaseCard
              label={t('system.phased.migration')}
              body={design.phasedArchitecture.migrationNotes}
            />
          </div>
        </Section>
      )}

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
                  <div className="flex items-center gap-2">
                    <div className="font-semibold" dir="auto">{s.name}</div>
                    {s.complexity && (
                      <ComplexityBadge
                        complexity={s.complexity}
                        rationale={s.complexityRationale}
                      />
                    )}
                  </div>
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

      {!buildVsBuyFirst && buildVsBuySection}

      {compliance.length > 0 && (
        <Section
          title={t('system.compliance.title')}
          count={compliance.length}
          icon={ShieldCheck}
          tone="blue"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/2">
                  {t('system.compliance.constraint')}
                </TableHead>
                <TableHead>{t('system.compliance.howAddressed')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compliance.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm" dir="auto">
                    {c.constraint}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" dir="auto">
                    {c.howAddressed}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

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

function BuildVsBuyRow({ item }: { item: BuildVsBuyItem }) {
  const { t } = useTranslation('stages');
  return (
    <TableRow>
      <TableCell className="font-medium">
        {t(`system.buildVsBuy.cap.${item.capability}`, {
          defaultValue: item.capability,
        })}
      </TableCell>
      <TableCell>
        <Badge variant={item.recommendation === 'buy' ? 'primary' : 'secondary'}>
          {t(`system.buildVsBuy.${item.recommendation}`)}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground" dir="auto">
        {item.suggestedService && (
          <span className="me-1 font-medium text-foreground">
            {item.suggestedService} —
          </span>
        )}
        {item.rationale}
        {item.impact && (
          <span className="mt-1 block text-xs italic">{item.impact}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function PhaseCard({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
        {label}
      </div>
      <p className="text-sm text-muted-foreground" dir="auto">
        {body}
      </p>
    </div>
  );
}
