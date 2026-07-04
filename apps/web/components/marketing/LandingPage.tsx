'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  Flag,
  GitBranch,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import { IdeaToProductDemo } from '@/components/marketing/IdeaToProductDemo';
import { LandingNavActions } from '@/components/marketing/LandingNavActions';

/** A pipeline stage; text is resolved from `marketing.pipeline.nodes.<key>`. */
type TreeNode = {
  key: string;
  icon: LucideIcon;
  /** An optional standalone artifact that branches off this stage. */
  branch?: { key: string; icon: LucideIcon; side: 'left' | 'right' };
};

/**
 * The pipeline as a tree: a gated trunk (each stage builds on the last) with two
 * standalone branches — Product Vision off the interview, Roadmap off the design.
 */
const PIPELINE_TREE: TreeNode[] = [
  { key: 'idea', icon: Sparkles },
  {
    key: 'interview',
    icon: MessageSquare,
    branch: { key: 'productVision', icon: Boxes, side: 'right' },
  },
  { key: 'requirements', icon: FileText },
  { key: 'system', icon: Network },
  { key: 'database', icon: Database },
  { key: 'api', icon: Webhook },
  {
    key: 'review',
    icon: ClipboardCheck,
    branch: { key: 'roadmap', icon: Flag, side: 'left' },
  },
  { key: 'export', icon: Download },
];

/** The 12 capabilities, grouped into three themed bands (Capture → Design → Ship). */
const FEATURE_GROUPS: { key: string; items: { key: string; icon: LucideIcon }[] }[] =
  [
    {
      key: 'capture',
      items: [
        { key: 'interview', icon: MessageSquare },
        { key: 'requirements', icon: FileText },
        { key: 'vision', icon: Boxes },
      ],
    },
    {
      key: 'design',
      items: [
        { key: 'systemDb', icon: Network },
        { key: 'api', icon: Webhook },
        { key: 'diagrams', icon: Workflow },
        { key: 'roadmap', icon: Flag },
      ],
    },
    {
      key: 'ship',
      items: [
        { key: 'review', icon: ClipboardCheck },
        { key: 'refine', icon: GitBranch },
        { key: 'editors', icon: BookOpen },
        { key: 'export', icon: Download },
        { key: 'secure', icon: ShieldCheck },
      ],
    },
  ];

const STEPS = ['1', '2', '3', '4'] as const;

/** Small uppercase section marker used above headings. */
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
      <span className="h-px w-6 bg-primary" />
      {children}
    </div>
  );
}

/** A footer link column. */
function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <div className="text-sm font-semibold">{title}</div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="transition-colors hover:text-foreground">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A gated stage chip in the flow. */
function StageChip({ index, node }: { index: number; node: TreeNode }) {
  const { t } = useTranslation('marketing');
  const Icon = node.icon;
  return (
    <div
      title={t(`pipeline.nodes.${node.key}.desc`)}
      className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/50"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="pe-1">
        <div className="font-mono text-[10px] leading-none text-muted-foreground">
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className="text-sm font-semibold leading-tight">
          {t(`pipeline.nodes.${node.key}.label`)}
        </div>
      </div>
    </div>
  );
}

/** A standalone artifact hanging off a stage (dashed = not gated). */
function BranchChip({ branch }: { branch: NonNullable<TreeNode['branch']> }) {
  const { t } = useTranslation('marketing');
  const Icon = branch.icon;
  return (
    <div
      title={t(`pipeline.branches.${branch.key}.desc`)}
      className="flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="text-xs font-semibold">
        {t(`pipeline.branches.${branch.key}.label`)}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-primary/70">
        {t('pipeline.standalone')}
      </span>
    </div>
  );
}

/** The pipeline as a horizontal flow rail. */
function PipelineTree() {
  return (
    <ol className="flex flex-wrap items-start gap-x-2 gap-y-10">
      {PIPELINE_TREE.map((node, i) => {
        const last = i === PIPELINE_TREE.length - 1;
        return (
          <li key={node.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <StageChip index={i} node={node} />
              {!last && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 rtl:-scale-x-100" />
              )}
            </div>
            {node.branch && (
              <div className="flex flex-col items-start ps-4">
                <span className="ms-1 h-3 w-px bg-primary/40" />
                <BranchChip branch={node.branch} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function LandingPage() {
  const { t } = useTranslation('marketing');

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Blueprint grid + glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] dark:opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage:
            'radial-gradient(ellipse 80% 50% at 50% 0%, #000 60%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 50% at 50% 0%, #000 60%, transparent 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
      />

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5 sm:px-6 lg:px-8">
          <Link href="/">
            <Logo />
          </Link>
          <div className="ms-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#pipeline" className="transition-colors hover:text-foreground">
              {t('nav.pipeline')}
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              {t('nav.features')}
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              {t('nav.how')}
            </a>
          </div>
          <LandingNavActions />
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-20 lg:px-8 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {t('hero.badge')}
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.75rem]">
            {t('hero.titleLead')}{' '}
            <span className="bg-gradient-to-r from-primary to-[hsl(var(--success))] bg-clip-text text-transparent">
              {t('hero.titleAccent')}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t('hero.body')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                {t('hero.start')}{' '}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">{t('hero.see')}</a>
            </Button>
          </div>
        </div>

        {/* Looping build demo */}
        <div className="mx-auto mt-12 max-w-5xl sm:mt-14">
          <IdeaToProductDemo />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t('hero.demoCaption')}
          </p>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Kicker>{t('pipeline.kicker')}</Kicker>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            {t('pipeline.title')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {t('pipeline.body')}
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-border bg-card" />
              {t('pipeline.legendGated')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-primary/40 bg-primary/5" />
              {t('pipeline.legendStandalone')}
            </span>
          </div>

          <div className="mt-10">
            <PipelineTree />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Kicker>{t('features.kicker')}</Kicker>
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
          {t('features.title')}
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('features.body')}</p>

        <div className="mt-12 space-y-12">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.key} className="grid gap-6 md:grid-cols-[13rem_1fr]">
              <div className="md:pt-1">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                  {t(`features.groups.${group.key}.kicker`)}
                </div>
                <h3 className="mt-1.5 text-lg font-semibold tracking-tight">
                  {t(`features.groups.${group.key}.label`)}
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map(({ key, icon: Icon }) => (
                  <div
                    key={key}
                    className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h4 className="mt-3 text-sm font-semibold">
                      {t(`features.groups.${group.key}.items.${key}.title`)}
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t(`features.groups.${group.key}.items.${key}.body`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Kicker>{t('how.kicker')}</Kicker>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            {t('how.title')}
          </h2>

          <div className="relative mt-14 space-y-12 md:space-y-0 md:before:absolute md:before:inset-y-6 md:before:left-1/2 md:before:w-px md:before:-translate-x-1/2 md:before:border-l md:before:border-dashed md:before:border-border">
            {STEPS.map((n, i) => {
              const alt = i % 2 === 1;
              return (
                <div
                  key={n}
                  className="relative md:grid md:min-h-[10rem] md:grid-cols-2 md:items-center md:gap-12"
                >
                  <span className="absolute left-1/2 top-1/2 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background md:block" />

                  <div
                    className={cn(
                      'flex',
                      alt ? 'md:order-2 md:justify-start md:ps-12' : 'md:justify-end md:pe-12',
                    )}
                  >
                    <span
                      className="select-none bg-gradient-to-br from-primary to-[hsl(var(--success))] bg-clip-text font-black leading-none text-transparent"
                      style={{ fontSize: 'clamp(4rem, 11vw, 8.5rem)' }}
                    >
                      {n}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'mt-3 md:mt-0',
                      alt ? 'md:order-1 md:pe-12 md:text-end' : 'md:ps-12',
                    )}
                  >
                    <div className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                      {t('how.stepLabel', { n })}
                    </div>
                    <h3 className="mt-2 text-xl font-bold tracking-tight">
                      {t(`how.steps.${n}.title`)}
                    </h3>
                    <p
                      className={cn(
                        'mt-2 text-muted-foreground md:max-w-sm',
                        alt && 'md:ms-auto',
                      )}
                    >
                      {t(`how.steps.${n}.body`)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-8 text-center sm:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4] dark:opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(hsl(var(--primary) / 0.18) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage:
                'radial-gradient(ellipse 70% 60% at 50% 50%, #000 40%, transparent 100%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 70% 60% at 50% 50%, #000 40%, transparent 100%)',
            }}
          />
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            {t('manifesto.kicker')}
          </p>
          <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {t('manifesto.titleLead')}{' '}
            <span className="bg-gradient-to-r from-primary to-[hsl(var(--success))] bg-clip-text text-transparent">
              {t('manifesto.titleAccent')}
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {t('manifesto.body')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                {t('manifesto.design')}{' '}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/register">{t('manifesto.create')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                {t('footer.tagline')}
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/dashboard">
                  {t('footer.start')}{' '}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
            </div>
            <FooterCol
              title={t('footer.explore')}
              links={[
                [t('footer.links.pipeline'), '#pipeline'],
                [t('footer.links.features'), '#features'],
                [t('footer.links.how'), '#how'],
              ]}
            />
            <FooterCol
              title={t('footer.account')}
              links={[
                [t('footer.links.signIn'), '/login'],
                [t('footer.links.createAccount'), '/register'],
                [t('footer.links.dashboard'), '/dashboard'],
              ]}
            />
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
            <span>{t('footer.rights', { year: new Date().getFullYear() })}</span>
            <span className="font-mono">{t('footer.tagshort')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
