'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Clock,
  Coins,
  Database,
  Download,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Minus,
  Network,
  Plus,
  ShieldCheck,
  Sparkles,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import {
  PLANS,
  annualSavings,
  planPriceForCycle,
  type BillingCycle,
} from '@archivato/shared';
import { cn } from '@/lib/utils';
import { waitlistApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shared/Logo';
import { IdeaToProductDemo } from '@/components/marketing/IdeaToProductDemo';
import { LandingNavActions } from '@/components/marketing/LandingNavActions';

/** The three problem pain-points (copy resolved from `marketing.problem.items.*`). */
const PROBLEMS: { key: string; icon: LucideIcon }[] = [
  { key: 'blank', icon: FileText },
  { key: 'slow', icon: Clock },
  { key: 'costly', icon: Coins },
];

/** The three solution pillars (copy from `marketing.solution.items.*`). */
const SOLUTIONS: { key: string; icon: LucideIcon }[] = [
  { key: 'interview', icon: MessageSquare },
  { key: 'design', icon: Network },
  { key: 'ship', icon: Download },
];

/** Condensed pipeline strip shown in the Solution section. */
const PIPELINE: { key: string; icon: LucideIcon }[] = [
  { key: 'idea', icon: Sparkles },
  { key: 'interview', icon: MessageSquare },
  { key: 'requirements', icon: FileText },
  { key: 'system', icon: Network },
  { key: 'database', icon: Database },
  { key: 'api', icon: Webhook },
  { key: 'review', icon: ClipboardCheck },
  { key: 'export', icon: Download },
];

/** FAQ items are keyed q1..q6 in the `marketing.faq.items` object. */
const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const;

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

/** One collapsible FAQ row. */
function FaqRow({
  q,
  a,
  open,
  onToggle,
}: {
  q: string;
  a: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start"
      >
        <span className="font-semibold" dir="auto">
          {q}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <p
          dir="auto"
          className="border-t border-border/60 px-5 py-4 text-sm text-muted-foreground"
        >
          {a}
        </p>
      )}
    </div>
  );
}

/** Email capture that posts to the public waitlist endpoint. */
function WaitlistForm() {
  const { t, i18n } = useTranslation('marketing');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'new' | 'existing' | 'error'
  >('idle');

  const done = status === 'new' || status === 'existing';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus('error');
      return;
    }
    setStatus('submitting');
    try {
      const res = await waitlistApi.join({
        email: email.trim(),
        locale: i18n.language,
        source: 'landing-waitlist',
      });
      setStatus(res.alreadyJoined ? 'existing' : 'new');
    } catch {
      setStatus('error');
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl border border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 px-5 py-4 text-sm font-medium text-[hsl(var(--success))]">
        <Check className="h-5 w-5 shrink-0" />
        <span dir="auto">
          {status === 'new' ? t('waitlist.successNew') : t('waitlist.successExisting')}
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === 'error') setStatus('idle');
            }}
            placeholder={t('waitlist.placeholder')}
            className="h-11 w-full rounded-lg border border-border bg-background ps-9 pe-3 text-sm outline-none ring-primary/40 transition-shadow focus:ring-2"
          />
        </div>
        <Button type="submit" size="lg" disabled={status === 'submitting'}>
          {status === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('waitlist.cta')}
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {status === 'error' ? (
          <span className="text-destructive">{t('waitlist.invalid')}</span>
        ) : (
          t('waitlist.privacy')
        )}
      </p>
    </form>
  );
}

/** One pricing plan card. */
function PriceCard({
  plan,
  cycle,
  featured,
}: {
  plan: 'free' | 'pro';
  cycle: BillingCycle;
  featured?: boolean;
}) {
  const { t } = useTranslation('marketing');
  const info = PLANS[plan];
  const isPaidAnnual = info.priceUsd > 0 && cycle === 'annual';
  // Paid plans always show a monthly figure; annual shows the effective /mo.
  const monthly = isPaidAnnual ? annualSavings(info).perMonthUsd : info.priceUsd;
  const features = t(`pricing.${plan}.features`, {
    returnObjects: true,
  }) as string[];

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm',
        featured ? 'border-primary shadow-md ring-1 ring-primary/30' : 'border-border',
      )}
    >
      {featured && (
        <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
          {t('pricing.mostPopular')}
        </span>
      )}
      <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {t(`pricing.${plan}.name`)}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight" dir="ltr">
          {info.priceUsd === 0 ? t('pricing.freePrice') : `$${monthly}`}
        </span>
        {info.priceUsd > 0 && (
          <span className="text-sm text-muted-foreground">{t('pricing.perMonth')}</span>
        )}
      </div>
      <div className="mt-1 h-4 text-xs text-muted-foreground" dir="ltr">
        {isPaidAnnual &&
          t('pricing.billedAnnually', {
            price: planPriceForCycle(info, 'annual'),
          })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground" dir="auto">
        {t(`pricing.${plan}.tagline`)}
      </p>

      <Button
        asChild
        size="lg"
        variant={featured ? 'default' : 'outline'}
        className="mt-5"
      >
        <Link href="/register">{t(`pricing.${plan}.cta`)}</Link>
      </Button>

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

/** Monthly | Annual segmented toggle for the pricing section. */
function PricingCycleToggle({
  cycle,
  onChange,
}: {
  cycle: BillingCycle;
  onChange: (cycle: BillingCycle) => void;
}) {
  const { t } = useTranslation('marketing');
  const savePct = annualSavings(PLANS.pro).savePct;
  return (
    <div
      role="radiogroup"
      aria-label={t('pricing.cycle.label')}
      className="inline-grid grid-cols-2 gap-1 rounded-full border border-border bg-muted/40 p-1"
    >
      {(['monthly', 'annual'] as const).map((c) => {
        const active = cycle === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`pricing.cycle.${c}`)}
            {c === 'annual' && savePct > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {t('pricing.cycle.save', { pct: savePct })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function LandingPage() {
  const { t } = useTranslation('marketing');
  const [openFaq, setOpenFaq] = useState<string | null>('q1');
  const [cycle, setCycle] = useState<BillingCycle>('annual');

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
            <a href="#problem" className="transition-colors hover:text-foreground">
              {t('nav.problem')}
            </a>
            <a href="#solution" className="transition-colors hover:text-foreground">
              {t('nav.solution')}
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              {t('nav.pricing')}
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              {t('nav.faq')}
            </a>
          </div>
          <LandingNavActions />
        </nav>
      </header>

      {/* Hero — keeps the looping build video */}
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
              <a href="#waitlist">
                {t('hero.joinWaitlist')}{' '}
                <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/dashboard">{t('hero.start')}</Link>
            </Button>
          </div>
        </div>

        {/* Looping build demo (the "video") */}
        <div className="mx-auto mt-12 max-w-5xl sm:mt-14">
          <IdeaToProductDemo />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t('hero.demoCaption')}
          </p>
        </div>
      </section>

      {/* The Problem */}
      <section id="problem" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Kicker>{t('problem.kicker')}</Kicker>
          <h2 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            {t('problem.title')}
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t('problem.body')}</p>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">
                  {t(`problem.items.${key}.title`)}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {t(`problem.items.${key}.body`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section id="solution" className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Kicker>{t('solution.kicker')}</Kicker>
        <h2 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
          {t('solution.title')}
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t('solution.body')}</p>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {SOLUTIONS.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{t(`solution.items.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {t(`solution.items.${key}.body`)}
              </p>
            </div>
          ))}
        </div>

        {/* Condensed pipeline strip */}
        <div className="mt-12 rounded-2xl border border-border bg-card/60 p-5 sm:p-6">
          <div className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {t('solution.pipelineNote')}
          </div>
          <ol className="flex flex-wrap items-center gap-2">
            {PIPELINE.map(({ key, icon: Icon }, i) => (
              <li key={key} className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">
                    {t(`solution.pipeline.${key}`)}
                  </span>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 rtl:-scale-x-100" />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <div className="text-center">
            <Kicker>
              <span className="mx-auto flex items-center gap-2">
                {t('pricing.kicker')}
              </span>
            </Kicker>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {t('pricing.title')}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              {t('pricing.body')}
            </p>
            <div className="mt-6 flex justify-center">
              <PricingCycleToggle cycle={cycle} onChange={setCycle} />
            </div>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <PriceCard plan="free" cycle={cycle} />
            <PriceCard plan="pro" cycle={cycle} featured />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="text-center">
          <Kicker>
            <span className="mx-auto flex items-center gap-2">{t('faq.kicker')}</span>
          </Kicker>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('faq.title')}
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {FAQ_KEYS.map((k) => (
            <FaqRow
              key={k}
              q={t(`faq.items.${k}.q`)}
              a={t(`faq.items.${k}.a`)}
              open={openFaq === k}
              onToggle={() => setOpenFaq((prev) => (prev === k ? null : k))}
            />
          ))}
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
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
            {t('waitlist.kicker')}
          </p>
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {t('waitlist.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {t('waitlist.body')}
          </p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                {t('footer.tagline')}
              </p>
              <Button asChild size="sm" className="mt-4">
                <a href="#waitlist">
                  {t('footer.start')}{' '}
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </a>
              </Button>
            </div>
            <FooterCol
              title={t('footer.explore')}
              links={[
                [t('footer.links.problem'), '#problem'],
                [t('footer.links.solution'), '#solution'],
                [t('footer.links.pricing'), '#pricing'],
                [t('footer.links.faq'), '#faq'],
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
            <span className="font-mono">{t('footer.tagshort')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
