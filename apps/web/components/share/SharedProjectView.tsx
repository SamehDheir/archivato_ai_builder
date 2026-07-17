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
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
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
    /*
     * A document, not an app screen: a single centred column with generous
     * vertical rhythm and almost no chrome. `max-w-3xl` rather than the old
     * `max-w-5xl` — this page is read, not operated, and a 1024px-wide run of
     * prose is a wall. Wide artifacts (tables, ERDs) don't fight it: each scrolls
     * inside its own container, so the measure holds and the page body never
     * scrolls sideways.
     */
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
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

  /*
   * TODO(R14): the header shows the date but not the CLIENT's name ("Prepared
   * for Acme Retail"), which the design spec asked for. `session.clientName`
   * exists (R5) but is deliberately not on the `SharedProject` payload, and this
   * task is presentation-only — no API changes. Adding it is one field on the
   * projection in ShareService.view plus a line here, but it is also a
   * positioning call (does a client want to see the label their vendor filed
   * them under?), so it wants its own slice rather than a silent widening of a
   * public payload.
   */

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
    <header className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <Link href="/" aria-label="Archivato">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          {/* The date this proposal was issued. A document a client is deciding
              on needs to say when it was written — an undated quote is one
              nobody can tell is current. */}
          <time
            className="text-xs text-muted-foreground"
            dateTime={project.sharedAt}
          >
            {fmt.date(new Date(project.sharedAt))}
          </time>
          <Badge variant="secondary">{t('badge')}</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <h1
          className="text-balance text-h1 font-semibold sm:text-display"
          dir="auto"
        >
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
        className="flex w-full items-center gap-3 rounded-xl px-5 py-4 text-start transition-colors duration-fast ease-out hover:bg-muted/40"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-medium" dir="auto">
          {title}
        </span>
        {/*
          The affordance. `rtl:-scale-x-100` is NOT used here on purpose: a
          chevron pointing down is symmetric about the vertical axis, so mirroring
          it does nothing — it's the rotation that carries the state, and that
          reads identically in both directions.
        */}
        <ChevronDown
          className={cn(
            'ms-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-base ease-out',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {/*
        Closed appendices are NOT in the DOM, so they don't print — deliberate.
        The alternative (always render, hide with CSS, reveal for print) would
        mount every appendix on every page load, including the Mermaid ER diagram,
        to serve a reader who prints. The client-facing sections above — the ones
        a proposal is actually judged on — are always rendered and always print;
        an appendix the reader opened prints too, because it's real by then.
      */}
      {open && <div className="border-t border-border/60 p-5">{children}</div>}
    </div>
  );
}

/** The growth loop: a stranger just saw the output — now offer them the product. */
function ShareCta() {
  const { t } = useTranslation('share');
  return (
    // `data-print="hide"`: our ad has no business on the printed copy of someone
    // else's proposal. The watermark below stays — that one is the deal.
    <Card data-print="hide" className="border-primary/30 bg-primary-subtle">
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

/**
 * The share page's first paint, while the lazy `stages` i18n chunk lands.
 *
 * This is the very first thing a cold visitor — the owner's CLIENT — sees of
 * this product, so it is shaped like the proposal that follows (header rule,
 * title, lead, three stat tiles, first section) rather than the three anonymous
 * grey bars it used to be. Same container geometry as `SharedProjectContent`, so
 * nothing moves when the real thing swaps in.
 */
function SharedProjectSkeleton() {
  return (
    <div
      className="mx-auto max-w-3xl space-y-10 px-4 py-8 sm:px-6 sm:py-12"
      role="status"
      aria-busy
    >
      <span className="sr-only">Loading…</span>
      <header className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-2 h-6 w-16" />
            </div>
          ))}
        </div>
      </header>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
        </div>
        <div className="rounded-lg border border-border p-5">
          <SkeletonText lines={5} />
        </div>
      </div>
    </div>
  );
}
