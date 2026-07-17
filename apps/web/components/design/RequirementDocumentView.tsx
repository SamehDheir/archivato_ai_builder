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
 * A neutral category pill, used for NFR categories (performance, security, …).
 *
 * This was a twelve-entry map onto a six-hue rainbow, and `Section` carried a
 * matching `tone` prop that painted each section header a different colour.
 * Both went in R14, for the same reason: **this document is what the owner's
 * CLIENT reads while deciding whether to sign**, and a rainbow of section
 * headers reads as a template, not a proposal. The category word is right there
 * inside the pill — the hue was never carrying information the label wasn't.
 *
 * Colour in this app now means exactly one of two things: a semantic state
 * (success / warning / danger / info) or an unordered data category
 * (`--data-*`, the canvas node kinds). "Section #4" is neither, so it gets
 * none. Don't reintroduce a decorative palette here.
 */
function CategoryPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
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
                  {/* `dir="auto"` — this is AI-generated artifact text, and the
                      generated artifacts are server-side English while the UI may
                      be Arabic. Without it the English inherits the page's RTL
                      and bidi reorders it: the sentence's full stop jumps to the
                      left-hand end. Let each string pick its own direction. */}
                  <TableCell>
                    <div className="font-medium" dir="auto">
                      {fr.title}
                    </div>
                    {fr.description && fr.description !== fr.title && (
                      <div className="mt-0.5 text-sm text-muted-foreground" dir="auto">
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
        >
          {doc.roles.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {doc.roles.map((role) => (
                <Card
                  key={role.name}
                  className="border-s-2 border-s-primary/50"
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
        >
          <ul className="space-y-2 text-sm">
            {doc.outOfScope!.map((item, i) => (
              <li key={i} className="flex gap-2">
                {/* Out-of-scope is a scope-creep guard, not a failure — muted,
                    not danger. A red list of "things you don't get" is a hostile
                    read on a document meant to build trust. */}
                <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
                      <CategoryPill>{nfr.category}</CategoryPill>
                    </TableCell>
                    <TableCell className="text-sm" dir="auto">
                      {nfr.description}
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

      {showTechnical && (
        <Section
          title={t('requirements.businessRules')}
          count={doc.businessRules.length}
          icon={Scale}
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
                    <TableCell className="text-sm" dir="auto">
                      {br.description}
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

      {showTechnical && (
        <ListSection
          title={t('requirements.constraints')}
          count={doc.constraints.length}
          icon={AlertTriangle}
          items={doc.constraints}
        />
      )}
    </div>
  );
}

/**
 * A titled block inside an artifact document — the shared heading used by every
 * `*View`. Deliberately monochrome: structure comes from the icon, the weight
 * and the spacing, never from hue (see `CategoryPill` for why the per-section
 * `tone` prop was removed).
 */
export function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {title}
        {typeof count === 'number' && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground">
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
  items,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  items: string[];
}) {
  return (
    <Section title={title} count={count} icon={icon}>
      {items.length ? (
        // `ps-5`: the bullet indent follows the reading direction, or the markers
        // hang off the wrong edge of an Arabic list.
        <ul className="list-disc space-y-1 ps-5 text-small marker:text-muted-foreground">
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
