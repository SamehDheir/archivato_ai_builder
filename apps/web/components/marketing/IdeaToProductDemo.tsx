'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  MessageSquare,
  Network,
  Pause,
  Play,
  Sparkles,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type Stage = {
  key: string;
  label: string;
  title: string;
  file: string;
  icon: LucideIcon;
};

/** The build, stage by stage — mirrors the real pipeline (idea → product). */
const STAGES: Stage[] = [
  { key: 'idea', label: 'Idea', title: 'Your idea', file: 'idea.txt', icon: Sparkles },
  { key: 'interview', label: 'Interview', title: 'Adaptive interview', file: 'interview', icon: MessageSquare },
  { key: 'requirements', label: 'Requirements', title: 'Requirement document', file: 'requirements.md', icon: FileText },
  { key: 'system', label: 'System', title: 'System design', file: 'system-design.json', icon: Network },
  { key: 'database', label: 'Database', title: 'Database schema', file: 'schema.prisma', icon: Database },
  { key: 'api', label: 'API', title: 'REST API design', file: 'openapi.yaml', icon: Webhook },
  { key: 'review', label: 'Review', title: 'AI architect review', file: 'review.json', icon: ClipboardCheck },
  { key: 'export', label: 'Product', title: 'Product blueprint', file: 'export/', icon: Download },
];

const STEP_MS = 2600;

/** Autoplay fallback for a fully passive viewer (no interaction at all). */
const AUTOPLAY_FALLBACK_MS = 8000;

/**
 * A looping, auto-playing "reel" that walks an idea all the way to a shippable
 * product — the landing page's lightweight stand-in for a demo video. Advances
 * on a timer (pausable), lets you click any stage, and stays still for users who
 * prefer reduced motion.
 *
 * Autoplay is **armed by the first user interaction** (pointer, scroll, touch,
 * key) with a generous timer fallback, rather than starting immediately. A real
 * visitor interacts within a moment of landing, so for them the reel starts
 * right away — but a passive robot like Lighthouse never interacts, and an
 * auto-advancing hero panel repainting every 2.6s deep into the trace read as
 * "the page never settles": Speed Index 6.8s on an otherwise sub-second page,
 * single-handedly costing ~10 performance points. Stage 1 is a complete,
 * designed screen, so the un-started reel is not a degraded state.
 */
export function IdeaToProductDemo() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Arm autoplay on the first interaction (or the fallback timer) — never for
  // users who prefer reduced motion; they can still click through / press play.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const events = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'keydown', 'scroll'] as const;
    const arm = () => {
      setPlaying(true);
      cleanup();
    };
    const timer = window.setTimeout(arm, AUTOPLAY_FALLBACK_MS);
    const cleanup = () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, arm);
    };
    for (const e of events) {
      window.addEventListener(e, arm, { once: false, passive: true });
    }
    return cleanup;
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setActive((a) => (a + 1) % STAGES.length),
      STEP_MS,
    );
    return () => clearInterval(id);
  }, [playing]);

  const current = STAGES[active];
  const HeaderIcon = current.icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/70 shadow-sm backdrop-blur">
      {/* Window chrome — reads like a screen recording */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        <span className="ml-2 truncate font-mono text-xs text-muted-foreground">
          archivato / {current.file}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {playing && (
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
              generating
            </span>
          )}
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause demo' : 'Play demo'}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        </span>
      </div>

      <div className="grid gap-4 p-3 sm:p-4 md:grid-cols-[190px_1fr]">
        {/* Stage rail — horizontal scroll on mobile, vertical list on desktop */}
        <ol className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:pb-0">
          {STAGES.map((s, i) => {
            const state = i === active ? 'active' : i < active ? 'done' : 'todo';
            const Icon = s.icon;
            return (
              <li key={s.key} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                    state === 'active' &&
                      'border-primary/50 bg-primary/10 font-semibold text-foreground',
                    state === 'done' &&
                      'border-border bg-background/40 text-muted-foreground',
                    state === 'todo' && 'border-border/60 text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                      state === 'active'
                        ? 'bg-primary text-primary-foreground'
                        : state === 'done'
                          ? 'bg-success/15 text-success'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {state === 'done' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="whitespace-nowrap md:whitespace-normal">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* The "screen" — a full panel with a header; content swaps per stage */}
        <div className="flex min-h-[300px] flex-col rounded-lg border border-border bg-background/60 p-4 sm:min-h-[340px] sm:p-5">
          <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HeaderIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold">{current.title}</span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              step {active + 1} / {STAGES.length}
            </span>
          </div>
          <div
            key={active}
            className="flex-1 animate-in fade-in-0 slide-in-from-bottom-1 duration-500"
          >
            <StageScreen index={active} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StageScreen({ index }: { index: number }) {
  switch (STAGES[index].key) {
    case 'idea':
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card px-3 py-2.5 font-mono text-sm leading-relaxed">
            <span className="text-muted-foreground">idea&gt; </span>
            A clinic booking app with appointments, billing &amp; reports
            <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse bg-primary align-middle" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Tag>Industry: Healthcare</Tag>
            <Tag>Scale: Startup</Tag>
            <Tag>Platform: Web + iOS</Tag>
            <Tag>Compliance: HIPAA</Tag>
          </div>
          <div>
            <SubHead>Detected capabilities</SubHead>
            <div className="flex flex-wrap gap-2 text-sm">
              {['Appointments', 'Billing', 'Reports', 'Notifications', 'Records'].map(
                (c) => (
                  <span
                    key={c}
                    className="rounded-md border border-border bg-card px-2 py-0.5"
                  >
                    {c}
                  </span>
                ),
              )}
            </div>
          </div>
          <Stat>1 domain · 4 user roles · 5 core capabilities detected</Stat>
        </div>
      );
    case 'interview':
      return (
        <div className="space-y-2.5 text-sm">
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {['Understanding', 'Business', 'Features', 'Scale'].map((p) => (
              <span
                key={p}
                className="flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-success"
              >
                <Check className="h-3 w-3" /> {p}
              </span>
            ))}
            <span className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Technical
            </span>
          </div>
          <Bubble from="ai">Who are the main users, and what can each do?</Bubble>
          <Bubble from="you">
            Admins run the clinic, doctors see their schedule, patients book
            visits.
          </Bubble>
          <Bubble from="ai">Should patients pay online, or at the desk?</Bubble>
          <Bubble from="you">Online — card payments, with emailed receipts.</Bubble>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Requirement coverage</span>
              <span>96%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[96%] rounded-full bg-success" />
            </div>
          </div>
        </div>
      );
    case 'requirements':
      return (
        <div className="space-y-3">
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <SubHead>Functional</SubHead>
              <ul className="space-y-1.5">
                {[
                  'Book & reschedule appointments',
                  'Online billing & receipts',
                  'Visit & revenue reports',
                  'Automated reminders',
                ].map((r) => (
                  <li key={r} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <div>
                <SubHead>Roles &amp; rules</SubHead>
                <ul className="space-y-1 text-muted-foreground">
                  <li>Admin · Doctor · Patient (RBAC)</li>
                  <li>Double-booking prevented</li>
                  <li>Audit log on record changes</li>
                </ul>
              </div>
              <div>
                <SubHead>Non-functional</SubHead>
                <ul className="space-y-1 text-muted-foreground">
                  <li>HIPAA · encryption at rest</li>
                  <li>99.9% uptime · &lt;300ms p95</li>
                </ul>
              </div>
            </div>
          </div>
          <Stat>18 functional · 6 non-functional · 5 business rules · 4 roles</Stat>
        </div>
      );
    case 'system':
      return (
        <div className="space-y-3">
          <p className="font-mono text-xs text-muted-foreground">
            architecture: modular_monolith
          </p>
          <div>
            <SubHead>Services</SubHead>
            <div className="flex flex-wrap gap-2">
              {['Auth', 'Scheduling', 'Billing', 'Reports', 'Notifications'].map(
                (s) => (
                  <span
                    key={s}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-sm"
                  >
                    {s}
                  </span>
                ),
              )}
            </div>
          </div>
          <div>
            <SubHead>Integrations</SubHead>
            <div className="flex flex-wrap gap-2">
              {['Stripe', 'Twilio', 'SendGrid', 'S3'].map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-sm"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          {/* No stack name-dropping in the hero: the buyer here is the shop owner
              pricing the work, not the engineer who will pick the framework. The
              stack is still generated — it just isn't the pitch. */}
          <p className="text-sm">
            <span className="text-muted-foreground">Stack: </span>
            recommended per layer, with the reasoning attached
          </p>
          <Stat>5 modules · 4 integrations · REST + webhooks</Stat>
        </div>
      );
    case 'database':
      return (
        <div className="space-y-3">
          <div className="grid gap-2 font-mono text-xs sm:grid-cols-2">
            {[
              ['users', 'id · name · role · email'],
              ['doctors', 'id · user_id · specialty'],
              ['appointments', 'id · patient_id · doctor_id · slot'],
              ['invoices', 'id · appointment_id · amount · paid'],
              ['payments', 'id · invoice_id · method · status'],
              ['audit_logs', 'id · actor_id · action · at'],
            ].map(([t, cols]) => (
              <div key={t} className="rounded-md border border-border bg-card p-2.5">
                <div className="font-semibold text-primary">{t}</div>
                <div className="mt-1 text-muted-foreground">{cols}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            relations: appointments → users · doctors → users · invoices →
            appointments · payments → invoices
          </p>
          <Stat>12 entities · 18 relations · PK/FK enforced · 9 indexes</Stat>
        </div>
      );
    case 'api':
      return (
        <div className="space-y-3">
          <ul className="space-y-1.5 font-mono text-xs">
            {[
              ['POST', '/appointments', '201'],
              ['GET', '/appointments?page=1', '200'],
              ['PATCH', '/appointments/:id', '200'],
              ['POST', '/invoices', '201'],
              ['POST', '/payments', '201'],
              ['GET', '/reports/revenue', '200'],
            ].map(([m, path, code]) => (
              <li key={path} className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-14 rounded px-1.5 py-0.5 text-center font-semibold',
                    m === 'GET'
                      ? 'bg-success/15 text-success'
                      : 'bg-primary/15 text-primary',
                  )}
                >
                  {m}
                </span>
                <span className="flex-1 truncate text-muted-foreground">{path}</span>
                <span className="text-muted-foreground/70">{code}</span>
              </li>
            ))}
          </ul>
          <Stat>24 endpoints · 5 modules · JWT auth · OpenAPI 3.1</Stat>
        </div>
      );
    case 'review':
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border-4 border-success text-success">
              <span className="text-xl font-bold leading-none">91</span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                overall
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {[
                ['Security', 88],
                ['Scalability', 93],
                ['Performance', 85],
                ['Cost', 90],
              ].map(([k, v]) => (
                <li key={k as string} className="flex items-center gap-2">
                  <span className="w-20 text-muted-foreground">{k}</span>
                  <span className="font-semibold">{v}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <span className="font-semibold text-warning">2 critical</span> — add
            rate limiting on auth · encrypt PII at rest
          </div>
          <div>
            <SubHead>Suggestions</SubHead>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Cache read-heavy reports with Redis</li>
              <li>• Add CQRS + an event bus for billing</li>
            </ul>
          </div>
        </div>
      );
    case 'export':
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <Check className="h-4 w-4" /> Design complete — 6 artifacts
          </div>
          <div className="flex flex-wrap gap-2">
            {['JSON', 'Markdown', 'OpenAPI', 'GitHub repo', 'PDF'].map((f) => (
              <span
                key={f}
                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm"
              >
                <Download className="h-3.5 w-3.5 text-primary" /> {f}
              </span>
            ))}
          </div>
          <pre className="overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`clinic-system/
├─ docs/requirements.md
├─ prisma/schema.prisma
├─ src/  (5 modules)
├─ openapi.yaml
└─ README.md`}
          </pre>
          <p className="text-sm font-semibold">
            → Your product blueprint, ready for the team to build.
          </p>
        </div>
      );
    default:
      return null;
  }
}

/** A small chat bubble for the interview stage. */
function Bubble({
  from,
  children,
}: {
  from: 'ai' | 'you';
  children: React.ReactNode;
}) {
  if (from === 'ai') {
    return (
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 shrink-0 items-center rounded bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
          AI
        </span>
        <p className="rounded-lg rounded-tl-sm bg-muted px-3 py-1.5">{children}</p>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary/10 px-3 py-1.5">
        {children}
      </p>
    </div>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-card px-2 py-1 text-muted-foreground">
      {children}
    </span>
  );
}

/** A muted stats footer line — gives each stage a consistent, dense summary. */
function Stat({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-t border-border/60 pt-2 font-mono text-[11px] text-muted-foreground">
      {children}
    </p>
  );
}
