'use client';

import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Ban,
  FileText,
  Gauge,
  Lightbulb,
  ListChecks,
  Scale,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { RequirementAssumption, RequirementDocument } from '@archivato/shared';
import { cn } from '@/lib/utils';
import { requirementsToMarkdown } from '@/lib/artifact-markdown';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArtifactDownload } from '@/components/shared/ArtifactDownload';

const PRIORITY_VARIANT: Record<
  string,
  'destructive' | 'warning' | 'secondary'
> = {
  must: 'destructive',
  should: 'warning',
  could: 'secondary',
};

/**
 * A small palette of section accent tones. Each maps to a themed icon color and
 * a soft pill (bg + text) that reads on both light and dark backgrounds. Kept
 * as opt-in on `Section` so the many other views that reuse it stay neutral.
 */
const TONES = {
  blue: {
    icon: 'text-blue-600 dark:text-blue-400',
    chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  violet: {
    icon: 'text-violet-600 dark:text-violet-400',
    chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  emerald: {
    icon: 'text-emerald-600 dark:text-emerald-400',
    chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  amber: {
    icon: 'text-amber-600 dark:text-amber-400',
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  rose: {
    icon: 'text-rose-600 dark:text-rose-400',
    chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  },
  cyan: {
    icon: 'text-cyan-600 dark:text-cyan-400',
    chip: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  },
} as const;

type Tone = keyof typeof TONES;

/** Color-code non-functional requirements by their quality category. */
const NFR_CATEGORY_TONE: Record<string, Tone> = {
  performance: 'amber',
  security: 'rose',
  scalability: 'violet',
  reliability: 'emerald',
  availability: 'emerald',
  usability: 'cyan',
  accessibility: 'cyan',
  maintainability: 'blue',
  portability: 'cyan',
  compliance: 'rose',
  observability: 'blue',
  cost: 'amber',
};

/** A soft, tone-colored pill (used for NFR categories). */
function TonePill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        TONES[tone].chip,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Which slice of the document to render.
 *
 * - `full` (owner page + example tour): every section, with the document header.
 * - `client` (share page, "What's included"): the business-facing sections only —
 *   executive summary, functional requirements, roles, out-of-scope and
 *   assumptions. A non-technical buyer never sees NFRs, business rules, or
 *   constraints here.
 * - `technical` (share page appendix): only the developer-facing sections —
 *   non-functional requirements, business rules and constraints.
 *
 * The header (title + download) shows only in `full`; on the share page the
 * surrounding section/collapsible provides the heading.
 */
export type RequirementAudience = 'full' | 'client' | 'technical';

export function RequirementDocumentView({
  doc,
  audience = 'full',
}: {
  doc: RequirementDocument;
  audience?: RequirementAudience;
}) {
  const { t } = useTranslation('stages');
  const showHeader = audience === 'full';
  const showClient = audience !== 'technical';
  const showTechnical = audience !== 'client';

  // Assumptions & open questions: prefer the R7 structured field; fall back to
  // the flat `assumptions` list + interview `openQuestions` for older documents.
  const assumptionItems: RequirementAssumption[] = doc.assumptionsAndOpenQuestions
    ?.length
    ? doc.assumptionsAndOpenQuestions
    : [
        ...doc.assumptions.map((assumption) => ({ assumption, impactIfWrong: '' })),
        ...(doc.openQuestions ?? []).map((q) => ({
          assumption: q.questionForClient,
          impactIfWrong: '',
        })),
      ];

  return (
    <div>
      {/* Document header */}
      {showHeader && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {t('requirements.title')}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('requirements.meta', {
                  functional: doc.functional.length,
                  nonFunctional: doc.nonFunctional.length,
                  roles: doc.roles.length,
                  date: new Date(doc.generatedAt).toLocaleString(),
                })}
              </p>
            </div>
            <ArtifactDownload
              basename={`requirements-${doc.sessionId}`}
              formats={[
                {
                  label: 'Markdown',
                  ext: 'md',
                  mime: 'text/markdown',
                  build: () => requirementsToMarkdown(doc),
                },
                {
                  label: 'JSON',
                  ext: 'json',
                  mime: 'application/json',
                  build: () => JSON.stringify(doc, null, 2),
                },
              ]}
            />
          </div>
          <Separator className="mt-3" />
        </>
      )}

      {/* 1) Executive summary — plain-language, for the client. */}
      {showClient && doc.executiveSummary && (
        <Section title={t('requirements.executiveSummary')} icon={FileText}>
          <p className="text-sm leading-relaxed" dir="auto">
            {doc.executiveSummary}
          </p>
        </Section>
      )}

      {/* 2) Functional requirements. */}
      {showClient && (
      <Section
        title={t('requirements.functional')}
        count={doc.functional.length}
        icon={ListChecks}
        tone="blue"
      >
        {doc.functional.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">{t('requirements.col.id')}</TableHead>
                <TableHead>{t('requirements.col.requirement')}</TableHead>
                <TableHead className="w-24">
                  {t('requirements.col.priority')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {doc.functional.map((fr) => (
                <TableRow key={fr.id}>
                  <TableCell className="align-top font-mono text-xs text-muted-foreground">
                    {fr.id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{fr.title}</div>
                    {fr.description && fr.description !== fr.title && (
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {fr.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={PRIORITY_VARIANT[fr.priority] ?? 'secondary'}>
                      {t(`requirements.priority.${fr.priority}`, {
                        defaultValue: fr.priority,
                      })}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty />
        )}
      </Section>
      )}

      {/* 3) Roles & permissions — who can do what. */}
      {showClient && (
        <Section
          title={t('requirements.roles')}
          count={doc.roles.length}
          icon={Users}
          tone="emerald"
        >
          {doc.roles.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {doc.roles.map((role) => (
                <Card
                  key={role.name}
                  className="border-l-2 border-l-emerald-500/60"
                >
                  <CardContent className="p-4">
                    <div className="font-semibold" dir="auto">
                      {role.name}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground" dir="auto">
                      {role.description}
                    </p>
                    {role.permissions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {role.permissions.map((p) => (
                          <Badge variant="secondary" key={p}>
                            {p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Section>
      )}

      {/* 4) Out of scope — what the price does NOT include (scope-creep guard). */}
      {showClient && (doc.outOfScope?.length ?? 0) > 0 && (
        <Section
          title={t('requirements.outOfScope')}
          count={doc.outOfScope!.length}
          icon={Ban}
          tone="rose"
        >
          <ul className="space-y-2 text-sm">
            {doc.outOfScope!.map((item, i) => (
              <li key={i} className="flex gap-2">
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose-500/70" />
                <span dir="auto">
                  {item.item}
                  {item.reason && (
                    <span className="text-muted-foreground"> — {item.reason}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 5) Assumptions & open questions — each with its impact if wrong. */}
      {showClient && assumptionItems.length > 0 && (
        <Section
          title={t('requirements.assumptionsAndOpenQuestions')}
          count={assumptionItems.length}
          icon={Lightbulb}
          tone="cyan"
        >
          <ul className="space-y-2 text-sm">
            {assumptionItems.map((a, i) => (
              <li key={i} className="rounded-lg border border-border/60 p-3">
                <div dir="auto">{a.assumption}</div>
                {a.impactIfWrong && (
                  <div className="mt-1 text-xs text-muted-foreground" dir="auto">
                    <span className="font-medium">
                      {t('requirements.impactIfWrong')}
                    </span>{' '}
                    {a.impactIfWrong}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 6) Technical sections — for the dev team (hidden from the client block). */}
      {showTechnical && (
        <Section
          title={t('requirements.nonFunctional')}
          count={doc.nonFunctional.length}
          icon={Gauge}
          tone="violet"
        >
          {doc.nonFunctional.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    {t('requirements.col.id')}
                  </TableHead>
                  <TableHead className="w-36">
                    {t('requirements.col.category')}
                  </TableHead>
                  <TableHead>{t('requirements.col.requirement')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.nonFunctional.map((nfr) => (
                  <TableRow key={nfr.id}>
                    <TableCell className="align-top font-mono text-xs text-muted-foreground">
                      {nfr.id}
                    </TableCell>
                    <TableCell className="align-top">
                      <TonePill
                        tone={NFR_CATEGORY_TONE[nfr.category?.toLowerCase()] ?? 'blue'}
                      >
                        {nfr.category}
                      </TonePill>
                    </TableCell>
                    <TableCell className="text-sm">{nfr.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty />
          )}
        </Section>
      )}

      {showTechnical && (
        <Section
          title={t('requirements.businessRules')}
          count={doc.businessRules.length}
          icon={Scale}
          tone="amber"
        >
          {doc.businessRules.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    {t('requirements.col.id')}
                  </TableHead>
                  <TableHead>{t('requirements.col.rule')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.businessRules.map((br) => (
                  <TableRow key={br.id}>
                    <TableCell className="align-top font-mono text-xs text-muted-foreground">
                      {br.id}
                    </TableCell>
                    <TableCell className="text-sm">{br.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty />
          )}
        </Section>
      )}

      {showTechnical && (
        <ListSection
          title={t('requirements.constraints')}
          count={doc.constraints.length}
          icon={AlertTriangle}
          tone="amber"
          items={doc.constraints}
        />
      )}
    </div>
  );
}

export function Section({
  title,
  count,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  /** Optional accent color; omit for the neutral (muted) look. */
  tone?: Tone;
  children: React.ReactNode;
}) {
  const t = tone ? TONES[tone] : null;
  return (
    <div className="mt-6">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {Icon && (
          <Icon className={cn('h-4 w-4', t ? t.icon : 'text-muted-foreground')} />
        )}
        {title}
        {typeof count === 'number' && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-normal',
              t ? t.chip : 'bg-muted text-muted-foreground',
            )}
          >
            {count}
          </span>
        )}
      </h4>
      {children}
    </div>
  );
}

export function Empty() {
  return <span className="text-sm text-muted-foreground">—</span>;
}

function ListSection({
  title,
  count,
  icon,
  tone,
  items,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  tone?: Tone;
  items: string[];
}) {
  return (
    <Section title={title} count={count} icon={icon} tone={tone}>
      {items.length ? (
        <ul className="list-disc space-y-1 pl-5 text-sm marker:text-muted-foreground">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <Empty />
      )}
    </Section>
  );
}
