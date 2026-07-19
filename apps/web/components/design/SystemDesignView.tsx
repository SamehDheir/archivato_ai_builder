'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

/**
 * T-shirt size → chip tone. This is an ORDERED ramp, not a categorical palette:
 * complexity drives effort, which drives the price, so rising size is rising
 * cost/risk. That maps onto the semantic ladder exactly — which is why it earns
 * no hues of its own (the `--data-*` tokens are for unordered categories).
 */
const COMPLEXITY_TONE: Record<ModuleComplexity, string> = {
  S: 'bg-success-subtle text-success-subtle-foreground',
  M: 'bg-info-subtle text-info-subtle-foreground',
  L: 'bg-warning-subtle text-warning-subtle-foreground',
  XL: 'bg-destructive-subtle text-destructive-subtle-foreground',
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
  // Owner-only: the share payload never carries it (stripped in ShareService).
  const uncovered = design.uncoveredRequirements ?? [];

  const buildVsBuySection = buildVsBuy.length > 0 && (
    <Section
      title={t('system.buildVsBuy.title')}
      count={buildVsBuy.length}
      icon={Scale}
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

      <Section title={t('system.architecture')} icon={Network}>
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
        <Section title={t('system.phased.title')} icon={GitBranch}>
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

      <Section title={t('system.techStack')} icon={Layers}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">{t('system.col.layer')}</TableHead>
              <TableHead>{t('system.col.technology')}</TableHead>
              <TableHead>{t('system.col.why')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {design.techStack.map((tech) => (
              <TableRow key={tech.layer + tech.technology}>
                <TableCell className="font-mono text-xs">{tech.layer}</TableCell>
                <TableCell className="font-medium" dir="auto">
                  {tech.technology}
                </TableCell>
                {/* The Explain button lives INSIDE this cell rather than in a
                    column of its own. Its label is a whole phrase carrying
                    `whitespace-nowrap`, so as a 4th column it could not shrink:
                    `w-24` is only a hint, the nowrap content set the real width,
                    and it took that width out of this rationale — which then
                    wrapped at three words a line while the button sat on one.
                    The explanation is about the rationale, so it belongs with it.

                    Both children are ELEMENTS on purpose. In the stacked mobile
                    layout every element child is placed in the value column,
                    but a bare text node is an anonymous grid item with no
                    placement and auto-flows into the first free slot — which,
                    once a sibling element occupies the value column, is the
                    6.5rem LABEL column. Hence the wrapping span. */}
                <TableCell className="text-sm text-muted-foreground">
                  <span dir="auto">{tech.rationale}</span>
                  {interactive && (
                    <span className="mt-1 block">
                      <ExplainButton
                        onClick={() =>
                          setExplaining({ kind: 'tech', key: tech.layer })
                        }
                      />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title={t('system.services')} icon={Boxes}>
        <div className="grid gap-3 sm:grid-cols-2">
          {design.services.map((s) => (
            <Card key={s.name} className="border-s-2 border-s-primary/50">
              <CardContent className="p-4">
                {/* The explain label is a nowrap phrase and these cards are a
                    half-width grid column — the narrowest spot it appears in.
                    Without flex-wrap it can neither shrink nor break, so it
                    overflowed the card (R14). */}
                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
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

      {uncovered.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <AlertTitle>{t('system.uncovered.title')}</AlertTitle>
          <AlertDescription>
            {t('system.uncovered.body', { ids: uncovered.join(', ') })}
          </AlertDescription>
        </Alert>
      )}

      {compliance.length > 0 && (
        <Section
          title={t('system.compliance.title')}
          count={compliance.length}
          icon={ShieldCheck}
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
      {/* `rationale` is wrapped rather than left loose: with `suggestedService`
          present, this cell holds an element AND bare text, and in the stacked
          mobile layout the text — an anonymous grid item — auto-flows past the
          occupied value column into the 6.5rem LABEL column, where a full
          sentence wraps at two words a line. Every child here must be an
          element. */}
      <TableCell className="text-sm text-muted-foreground" dir="auto">
        {item.suggestedService && (
          <span className="me-1 font-medium text-foreground">
            {item.suggestedService} —
          </span>
        )}
        <span>{item.rationale}</span>
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
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
        {label}
      </div>
      <p className="text-sm text-muted-foreground" dir="auto">
        {body}
      </p>
    </div>
  );
}
