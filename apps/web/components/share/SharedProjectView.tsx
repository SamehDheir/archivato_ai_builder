'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Compass,
  Database as DatabaseIcon,
  FileText,
  FlaskConical,
  Network,
  Route,
  ShieldAlert,
  Sparkles,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { SharedProject } from '@archivato/shared';
import { cn } from '@/lib/utils';
import { useFormat } from '@/lib/i18n/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastProvider } from '@/components/shared/toast';
import { Logo } from '@/components/shared/Logo';
import { ProductVisionView } from '@/components/product/ProductVisionView';
import { RequirementDocumentView } from '@/components/design/RequirementDocumentView';
import { CostView } from '@/components/cost/CostView';
import { RoadmapView } from '@/components/roadmap/RoadmapView';
import { SystemDesignView } from '@/components/design/SystemDesignView';
import { DatabaseDesignView } from '@/components/design/DatabaseDesignView';
import { ApiDesignView } from '@/components/design/ApiDesignView';
import { ReviewView } from '@/components/review/ReviewView';
import { ThreatModelView } from '@/components/security/ThreatModelView';
import { QaPlanView } from '@/components/qa/QaPlanView';
import { loadShareNamespaces } from '@/lib/i18n/client';

/**
 * The public, read-only page behind a share link.
 *
 * **The reader is the client, not an engineer.** They own the idea, they are
 * deciding whether to sign, and they cannot read an ERD — an OpenAPI table tells
 * them nothing about whether to hire you. So the page is a *presentation*, not a
 * technical document:
 *
 *   1. what we're building (vision) → 2. what's included (requirements) →
 *   3. what it costs to run (estimate) → 4. how long it takes (roadmap)
 *
 * …and the schema, the API and the review sit **below, collapsed**, for the
 * developer the client forwards this to. That ordering is the whole point: the
 * first screen has to answer "is this the right thing, and can I afford it?",
 * not "how many tables does it have?".
 *
 * It renders the same artifact `*View` components the owner sees (they're pure
 * functions of their artifact — the `ExampleProjectView` pattern), so nothing is
 * duplicated. The page lives outside the `(app)` route group and mounts only the
 * provider it actually needs (`ToastProvider`, for the ER-diagram export buttons).
 */
export function SharedProjectView({ project }: { project: SharedProject }) {
  // The artifact views read the `stages` namespace, which is not in the eager
  // (public) i18n tier. Hold the first render until it lands so the page never
  // flashes raw translation keys at a client seeing this for the first time.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void loadShareNamespaces().then(() => setReady(true));
  }, []);

  if (!ready) return <SharedProjectSkeleton />;
  return (
    <ToastProvider>
      <SharedProjectContent project={project} />
    </ToastProvider>
  );
}

function SharedProjectContent({ project }: { project: SharedProject }) {
  const { t } = useTranslation('share');
  const { vision, costEstimate, roadmap, apiDesign, review, threatModel, qaPlan } =
    project;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <ProposalHeader project={project} />

      {/* ── The client's four questions, in the order they ask them ─────────── */}

      {vision && (
        <Section
          icon={Compass}
          title={t('section.vision.title')}
          lead={t('section.vision.lead')}
        >
          <ProductVisionView vision={vision} />
        </Section>
      )}

      <Section
        icon={FileText}
        title={t('section.scope.title')}
        lead={t('section.scope.lead')}
      >
        {/* Client audience: executive summary, functional requirements, roles,
            out-of-scope and assumptions. The technical requirements (NFRs,
            business rules, constraints) live in the appendix below. */}
        <RequirementDocumentView doc={project.requirements} audience="client" />
      </Section>

      {costEstimate && (
        <Section
          icon={Coins}
          title={t('section.cost.title')}
          lead={t('section.cost.lead')}
        >
          <CostView estimate={costEstimate} />
        </Section>
      )}

      {roadmap && (
        <Section
          icon={Route}
          title={t('section.plan.title')}
          lead={t('section.plan.lead')}
        >
          <RoadmapView roadmap={roadmap} />
        </Section>
      )}

      {/* ── The appendix: everything the client will forward, not read ──────── */}

      <div className="space-y-3 pt-2">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold" dir="auto">
            {t('appendix.title')}
          </h2>
          <p className="text-sm text-muted-foreground" dir="auto">
            {t('appendix.lead')}
          </p>
        </div>

        <Collapsible icon={ClipboardList} title={t('appendix.requirements')}>
          {/* The developer-facing requirements: non-functional, business rules,
              constraints. The client block above already showed the rest. */}
          <RequirementDocumentView
            doc={project.requirements}
            audience="technical"
          />
        </Collapsible>

        <Collapsible icon={Network} title={t('appendix.architecture')}>
          {/* `interactive` off: "Explain this decision" calls an owner-scoped API,
              which a link holder has no session for. `buildVsBuyFirst`: the
              build-vs-buy plan is the most client-readable part, so it leads. */}
          <SystemDesignView
            design={project.systemDesign}
            interactive={false}
            buildVsBuyFirst
          />
        </Collapsible>

        <Collapsible icon={DatabaseIcon} title={t('appendix.database')}>
          <DatabaseDesignView design={project.databaseDesign} />
        </Collapsible>

        {apiDesign && (
          <Collapsible icon={Webhook} title={t('appendix.api')}>
            <ApiDesignView design={apiDesign} />
          </Collapsible>
        )}

        {review && (
          <Collapsible icon={ClipboardCheck} title={t('appendix.review')}>
            <ReviewView report={review} />
          </Collapsible>
        )}

        {threatModel && (
          <Collapsible icon={ShieldAlert} title={t('appendix.threat')}>
            <ThreatModelView model={threatModel} />
          </Collapsible>
        )}

        {qaPlan && (
          <Collapsible icon={FlaskConical} title={t('appendix.qa')}>
            <QaPlanView plan={qaPlan} />
          </Collapsible>
        )}
      </div>

      <ShareCta />
      {project.watermark && <Watermark />}
    </div>
  );
}

/**
 * The first screen. The project's own name is the headline — the client should
 * recognise their project, not read our brand — and the tiles answer the three
 * questions a buyer actually has: what's in it, what does it cost to run, how
 * long does it take.
 */
function ProposalHeader({ project }: { project: SharedProject }) {
  const { t } = useTranslation('share');
  const fmt = useFormat();
  const { costEstimate, roadmap, requirements } = project;

  const idea = project.idea.idea.trim();
  const lead = idea && idea !== project.title.trim() ? idea : null;

  // The cheapest monthly figure at the smallest scale — "what does it cost to
  // keep the lights on", which is the number a client actually reacts to.
  const monthly = costEstimate
    ? costEstimate.providers
        .flatMap((p) => p.costs.map((c) => c.monthlyUsd))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)[0]
    : undefined;

  const tiles = [
    {
      key: 'scope' as const,
      value: String(requirements.functional.length),
    },
    ...(roadmap
      ? [{ key: 'timeline' as const, value: roadmap.totalEstimate }]
      : []),
    ...(monthly !== undefined
      ? [{ key: 'running' as const, value: fmt.usd(monthly) }]
      : []),
  ];

  return (
    <header className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" aria-label="Archivato">
          <Logo />
        </Link>
        <Badge variant="secondary">{t('badge')}</Badge>
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" dir="auto">
          {project.title}
        </h1>
        {/* The client's own one-line framing. NOT the vision statement: that is
            the first thing the "What we're building" section shows, and printing
            it twice, one screen apart, reads as a copy-paste slip. Skipped when
            the owner never named the project, since the title IS the idea then. */}
        {lead && (
          <p
            className="line-clamp-3 max-w-3xl text-base text-muted-foreground"
            dir="auto"
          >
            {lead}
          </p>
        )}
      </div>

      {tiles.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map(({ key, value }) => (
            <div key={key} className="rounded-lg border bg-card p-4">
              <dt className="text-xs text-muted-foreground" dir="auto">
                {t(`headline.${key}`)}
              </dt>
              <dd className="mt-1 truncate text-xl font-semibold" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-xs text-muted-foreground" dir="auto">
        {t('readonly')}
      </p>
    </header>
  );
}

/** A headline section of the proposal: what it is, in the client's language. */
function Section({
  icon: Icon,
  title,
  lead,
  children,
}: {
  icon: LucideIcon;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="space-y-0.5">
          <h2 className="text-xl font-semibold tracking-tight" dir="auto">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground" dir="auto">
            {lead}
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="p-5">{children}</CardContent>
      </Card>
    </section>
  );
}

/**
 * One appendix artifact, collapsed by default. Deliberately NOT a tab strip: tabs
 * imply "pick one of these", which is the wrong invitation for a client. A closed
 * row says "this exists, your developer will want it" and stays out of the way.
 */
function Collapsible({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-start"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium" dir="auto">
          {title}
        </span>
        <ChevronDown
          className={cn(
            'ms-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border/60 p-5">{children}</div>
      )}
    </div>
  );
}

/** The growth loop: a stranger just saw the output — now offer them the product. */
function ShareCta() {
  const { t } = useTranslation('share');
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('cta.title')}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground" dir="auto">
            {t('cta.body')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/">{t('cta.secondary')}</Link>
          </Button>
          <Button asChild>
            <Link href="/register">{t('cta.action')}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The free-tier watermark on a client-facing link.
 *
 * **Whether it renders is the server's call** (`SharedProject.watermark`, resolved
 * from the *owner's* plan — see `shouldWatermarkShare`), never a client-side plan
 * check: the page is public, so anything the browser could decide, a browser could
 * also skip.
 *
 * It is what a free owner pays with, on a feature that is otherwise free — and it
 * is deliberately small and quiet. This document goes to someone's client while a
 * deal is being decided; a loud banner across a proposal would cost the owner
 * credibility, and an owner who feels embarrassed by our link stops sending it,
 * which is the one behaviour the whole growth loop depends on.
 */
function Watermark() {
  const { t } = useTranslation('share');
  return (
    <div className="flex justify-center border-t border-border/60 pt-6">
      <a
        href="https://archivato.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        dir="auto"
      >
        {t('watermark')}
      </a>
    </div>
  );
}

function SharedProjectSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
