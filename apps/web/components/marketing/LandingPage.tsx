'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  Coins,
  Download,
  FileText,
  ImageIcon,
  MessageSquare,
  Send,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEMO_SHARE_URL,
  LANDING_PLANS,
  SCREENSHOTS,
  type LandingPlan,
} from '@/lib/landing';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import { IdeaToProductDemo } from '@/components/marketing/IdeaToProductDemo';
import { LandingHeader } from '@/components/marketing/LandingHeader';
import { LocalizedMeta } from '@/components/marketing/LocalizedMeta';
import { BackToTop } from '@/components/marketing/BackToTop';

/** The three steps in "How it works" (copy from `marketing.how.steps.*`). */
const STEPS: { key: string; icon: LucideIcon }[] = [
  { key: 'interview', icon: MessageSquare },
  { key: 'package', icon: FileText },
  { key: 'send', icon: Send },
];

/**
 * Hero proof points. Product facts, not social proof — there are no honest
 * customer numbers to claim yet.
 */
const HERO_STATS = ['time', 'questions', 'artifacts'] as const;

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

/** The "see a real scoping package" link — the page's single strongest proof. */
function DemoLink({
  label,
  variant = 'outline',
}: {
  label: string;
  variant?: 'outline' | 'secondary';
}) {
  return (
    <Button asChild size="lg" variant={variant}>
      {/* A real share link, so it opens the actual read-only client view. */}
      <a href={DEMO_SHARE_URL} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </Button>
  );
}

/** One of the two value columns (client / team). */
function ValueColumn({
  side,
  icon: Icon,
  featured,
}: {
  side: 'client' | 'team';
  icon: LucideIcon;
  featured?: boolean;
}) {
  const { t } = useTranslation('marketing');
  const items = t(`value.${side}.items`, { returnObjects: true }) as string[];

  return (
    <div
      className={cn(
        'flex flex-col rounded-2xl border bg-card p-6 shadow-sm sm:p-8',
        featured ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border',
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-xl font-semibold" dir="auto">
        {t(`value.${side}.title`)}
      </h3>
      <ul className="mt-5 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span dir="auto">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A proof screenshot, or — until the file exists — a labelled placeholder frame.
 * Rendering a placeholder rather than an `<Image>` at a path that isn't there
 * keeps a broken image off the page a buyer judges us by.
 */
function ScreenshotSlot({
  shot,
}: {
  shot: (typeof SCREENSHOTS)[number];
}) {
  const { t } = useTranslation('marketing');

  return (
    <figure className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-[16/10] w-full bg-muted/40">
        {shot.src ? (
          <Image
            src={shot.src}
            alt={t(`proof.shots.${shot.key}.title`)}
            fill
            sizes="(min-width: 1024px) 33vw, 100vw"
            className="object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/70 text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
            <span className="text-xs font-medium">{t('proof.placeholder')}</span>
            <code className="px-2 text-center text-[10px]" dir="ltr">
              {shot.expected}
            </code>
          </div>
        )}
      </div>
      <figcaption className="border-t border-border/60 p-5">
        <div className="font-semibold" dir="auto">
          {t(`proof.shots.${shot.key}.title`)}
        </div>
        <p className="mt-1 text-sm text-muted-foreground" dir="auto">
          {t(`proof.shots.${shot.key}.caption`)}
        </p>
      </figcaption>
    </figure>
  );
}

/** One pricing plan card. Prices come from `lib/landing.ts`, not from billing. */
function PriceCard({ plan }: { plan: LandingPlan }) {
  const { t } = useTranslation('marketing');
  const { key, price, featured, comingSoon } = plan;
  const features = t(`pricing.${key}.features`, {
    returnObjects: true,
  }) as string[];

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm',
        featured && 'border-primary shadow-md ring-1 ring-primary/30',
        comingSoon && 'border-dashed opacity-70',
        !featured && !comingSoon && 'border-border',
      )}
    >
      {featured && (
        <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
          {t('pricing.mostPopular')}
        </span>
      )}
      {comingSoon && (
        <span className="absolute -top-3 start-6 rounded-full bg-muted px-3 py-0.5 text-xs font-semibold text-muted-foreground">
          {t('pricing.comingSoon')}
        </span>
      )}

      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t(`pricing.${key}.name`)}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight" dir="ltr">
          {price ?? (comingSoon ? '—' : t('pricing.freePrice'))}
        </span>
        {price && (
          <span className="text-sm text-muted-foreground">{t('pricing.perMonth')}</span>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground" dir="auto">
        {t(`pricing.${key}.tagline`)}
      </p>

      {comingSoon ? (
        <Button size="lg" variant="outline" className="mt-5" disabled>
          {t(`pricing.${key}.cta`)}
        </Button>
      ) : (
        <Button
          asChild
          size="lg"
          variant={featured ? 'default' : 'outline'}
          className="mt-5"
        >
          <Link href="/register">{t(`pricing.${key}.cta`)}</Link>
        </Button>
      )}

      <ul className="mt-6 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span dir="auto">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation('marketing');

  return (
    <div className="relative min-h-screen overflow-hidden">
      <LocalizedMeta />
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

      <LandingHeader />

      <main>
        {/* 1 — Hero */}
        <section
          aria-labelledby="hero-title"
          className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-20 lg:px-8 lg:pt-24"
        >
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Users className="h-3.5 w-3.5" /> {t('hero.badge')}
            </div>
            <h1
              id="hero-title"
              className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]"
              dir="auto"
            >
              {t('hero.title')}
            </h1>
            <p
              className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg"
              dir="auto"
            >
              {t('hero.body')}
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  {t('hero.primaryCta')}{' '}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
              <DemoLink label={t('hero.secondaryCta')} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground" dir="auto">
              {t('hero.noCard')}
            </p>

            <div className="mx-auto mt-10 grid max-w-xl grid-cols-3 gap-4">
              {HERO_STATS.map((k) => (
                <div key={k} className="flex flex-col items-center">
                  <span className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
                    {t(`hero.stats.${k}.value`)}
                  </span>
                  <span
                    className="mt-1 text-center text-xs leading-snug text-muted-foreground"
                    dir="auto"
                  >
                    {t(`hero.stats.${k}.label`)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* The looping build reel — interaction-gated, so it can't drag the
              page's Speed Index down (see CLAUDE.md). */}
          <div className="mx-auto mt-12 max-w-5xl sm:mt-14">
            <IdeaToProductDemo />
            <p className="mt-3 text-center text-xs text-muted-foreground" dir="auto">
              {t('hero.demoCaption')}
            </p>
          </div>
        </section>

        {/* 2 — The pain */}
        <section
          id="pain"
          aria-labelledby="pain-title"
          className="scroll-mt-20 border-y border-border/60 bg-muted/30"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <Kicker>{t('pain.kicker')}</Kicker>
              <h2
                id="pain-title"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                dir="auto"
              >
                {t('pain.title')}
              </h2>
              <p className="mt-4 text-lg text-muted-foreground" dir="auto">
                {t('pain.body')}
              </p>
            </div>
          </div>
        </section>

        {/* 3 — How it works */}
        <section
          id="how"
          aria-labelledby="how-title"
          className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
        >
          <Kicker>{t('how.kicker')}</Kicker>
          <h2
            id="how-title"
            className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl"
            dir="auto"
          >
            {t('how.title')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground" dir="auto">
            {t('how.body')}
          </p>

          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ key, icon: Icon }, i) => (
              <li
                key={key}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold" dir="auto">
                  {t(`how.steps.${key}.title`)}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground" dir="auto">
                  {t(`how.steps.${key}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 4 — Two-sided value: the differentiator, so it gets the visual weight */}
        <section
          id="value"
          aria-labelledby="value-title"
          className="scroll-mt-20 border-y border-border/60 bg-muted/30"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <Kicker>
                <span className="mx-auto flex items-center gap-2">
                  {t('value.kicker')}
                </span>
              </Kicker>
              <h2
                id="value-title"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                dir="auto"
              >
                {t('value.title')}
              </h2>
              <p className="mt-3 text-muted-foreground" dir="auto">
                {t('value.body')}
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-2">
              <ValueColumn side="client" icon={Users} />
              <ValueColumn side="team" icon={Download} featured />
            </div>

            <p
              className="mt-10 text-center text-lg font-semibold tracking-tight sm:text-xl"
              dir="auto"
            >
              {t('value.tagline')}
            </p>
          </div>
        </section>

        {/* 5 — Proof */}
        <section
          id="proof"
          aria-labelledby="proof-title"
          className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
        >
          <Kicker>{t('proof.kicker')}</Kicker>
          <h2
            id="proof-title"
            className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl"
            dir="auto"
          >
            {t('proof.title')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground" dir="auto">
            {t('proof.body')}
          </p>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {SCREENSHOTS.map((shot) => (
              <ScreenshotSlot key={shot.key} shot={shot} />
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <DemoLink label={t('proof.cta')} variant="secondary" />
          </div>
        </section>

        {/* 6 — Pricing */}
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="scroll-mt-20 border-y border-border/60 bg-muted/30"
        >
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <div className="text-center">
              <Kicker>
                <span className="mx-auto flex items-center gap-2">
                  {t('pricing.kicker')}
                </span>
              </Kicker>
              <h2
                id="pricing-title"
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                dir="auto"
              >
                {t('pricing.title')}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground" dir="auto">
                {t('pricing.body')}
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {LANDING_PLANS.map((plan) => (
                <PriceCard key={plan.key} plan={plan} />
              ))}
            </div>
          </div>
        </section>

        {/* 7 — Final CTA */}
        <section
          id="start"
          aria-labelledby="final-title"
          className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
        >
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
              {t('finalCta.kicker')}
            </p>
            <h2
              id="final-title"
              className="mx-auto mt-5 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
              dir="auto"
            >
              {t('finalCta.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground" dir="auto">
              {t('finalCta.body')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/register">
                  {t('finalCta.primary')}{' '}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
              <DemoLink label={t('finalCta.secondary')} />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground" dir="auto">
                {t('footer.tagline')}
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/register">
                  {t('footer.start')}{' '}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
            </div>
            <FooterCol
              title={t('footer.explore')}
              links={[
                [t('footer.links.pain'), '#pain'],
                [t('footer.links.how'), '#how'],
                [t('footer.links.value'), '#value'],
                [t('footer.links.proof'), '#proof'],
                [t('footer.links.pricing'), '#pricing'],
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
            <FooterCol
              title={t('footer.legal')}
              links={[
                [t('footer.links.privacy'), '/privacy'],
                [t('footer.links.terms'), '/terms'],
              ]}
            />
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
            <span>{t('footer.rights', { year: new Date().getFullYear() })}</span>
            <span className="font-mono" dir="auto">
              {t('footer.tagshort')}
            </span>
          </div>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
