import Link from 'next/link';
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
import { ThemeToggle } from '@/components/shared/theme';
import { Logo } from '@/components/shared/Logo';
import { IdeaToProductDemo } from '@/components/marketing/IdeaToProductDemo';

type TreeNode = {
  label: string;
  icon: LucideIcon;
  desc: string;
  /** An optional standalone artifact that branches off this stage. */
  branch?: {
    label: string;
    icon: LucideIcon;
    desc: string;
    side: 'left' | 'right';
  };
};

/**
 * The pipeline as a tree: a gated trunk (each stage builds on the last) with two
 * standalone branches — Product Vision off the interview, Roadmap off the design.
 */
const PIPELINE_TREE: TreeNode[] = [
  { label: 'Idea', icon: Sparkles, desc: 'A sentence about the software you want to build.' },
  {
    label: 'Interview',
    icon: MessageSquare,
    desc: 'Adaptive Q&A until requirements are complete — then you confirm.',
    branch: {
      label: 'Product Vision',
      icon: Boxes,
      desc: 'A PM view of the confirmed interview: vision, goals, MVP, metrics, personas.',
      side: 'right',
    },
  },
  { label: 'Requirements', icon: FileText, desc: 'Functional & non-functional requirements, roles, rules, constraints.' },
  { label: 'System Design', icon: Network, desc: 'Architecture pattern, tech stack, and the service breakdown.' },
  { label: 'Database', icon: Database, desc: 'Entities, primary/foreign keys, and relationships.' },
  { label: 'API', icon: Webhook, desc: 'REST endpoints by module with request/response schemas.' },
  {
    label: 'Review',
    icon: ClipboardCheck,
    desc: 'A scored critique across security, scalability, performance, and cost.',
    branch: {
      label: 'Roadmap',
      icon: Flag,
      desc: 'The finished design sequenced into phases → milestones → tasks.',
      side: 'left',
    },
  },
  { label: 'Export', icon: Download, desc: 'JSON, Markdown, OpenAPI, or a scaffolded project repo.' },
];

type Feature = { title: string; body: string; icon: LucideIcon };

/** The 12 capabilities, grouped into three themed bands (Capture → Design → Ship). */
const FEATURE_GROUPS: { kicker: string; label: string; items: Feature[] }[] = [
  {
    kicker: '01 · Capture',
    label: 'Turn an idea into a spec',
    items: [
      {
        title: 'Adaptive AI interview',
        body: 'A phased interview clarifies your idea — goals, users, rules, scale, and tech — until requirements are complete. Then it waits for your confirmation.',
        icon: MessageSquare,
      },
      {
        title: 'Formal requirements',
        body: 'Functional & non-functional requirements, user roles with permissions, business rules, constraints, and assumptions — as a structured document.',
        icon: FileText,
      },
      {
        title: 'Product Vision',
        body: 'A PM view of the confirmed interview: north-star vision, goals, a lean MVP vs. a future roadmap, success metrics, and user personas.',
        icon: Boxes,
      },
    ],
  },
  {
    kicker: '02 · Design',
    label: 'Generate the system',
    items: [
      {
        title: 'System & database design',
        body: 'An architecture (pattern, tech stack, services) and a schema — entities, keys, and relationships — derived from the requirements.',
        icon: Network,
      },
      {
        title: 'REST API design',
        body: 'Endpoints grouped by module with request/response schemas and status codes, plus a live OpenAPI/Swagger view.',
        icon: Webhook,
      },
      {
        title: 'Diagrams & interactive canvas',
        body: 'Auto-generated Mermaid diagrams plus a React-Flow canvas you can rearrange — edits save back to the same design.',
        icon: Workflow,
      },
      {
        title: 'Implementation roadmap',
        body: 'The whole design sequenced into ordered phases → milestones → tasks, with rough effort estimates and dependencies.',
        icon: Flag,
      },
    ],
  },
  {
    kicker: '03 · Ship',
    label: 'Review, refine & export',
    items: [
      {
        title: 'AI Architect Review',
        body: 'A scored critique across security, scalability, performance, and cost — with an overall score, per-dimension sub-scores, and critical-issue callouts.',
        icon: ClipboardCheck,
      },
      {
        title: 'Refine by chat',
        body: 'Change the design in plain language after generation. Every change is versioned, so you can compare and restore any point.',
        icon: GitBranch,
      },
      {
        title: 'Structured editors',
        body: 'Every artifact is directly editable through structured forms — not a wall of text — with unsaved-change guards.',
        icon: BookOpen,
      },
      {
        title: 'Export anywhere',
        body: 'Download the whole system as JSON, Markdown, OpenAPI, or a ready-to-scaffold project structure.',
        icon: Download,
      },
      {
        title: 'Secure by default',
        body: 'JWT + rotating refresh in httpOnly cookies, email verification, OAuth, and per-project ownership on every route.',
        icon: ShieldCheck,
      },
    ],
  },
];

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Describe the idea',
    body: 'Type a sentence about the software you want. Add an industry or scale if you like.',
  },
  {
    n: '02',
    title: 'Answer the interview',
    body: 'The AI asks only what it needs, then summarizes. You confirm before any design begins.',
  },
  {
    n: '03',
    title: 'Generate the system',
    body: 'Requirements, architecture, database, API, and a scored review — each stage builds on the last.',
  },
  {
    n: '04',
    title: 'Refine, review & export',
    body: 'Tweak by chat or canvas, read the roadmap, then export to JSON, Markdown, OpenAPI, or a repo.',
  },
];

/** Small uppercase section marker used above headings. */
function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
      <span className="h-px w-6 bg-primary" />
      {children}
    </div>
  );
}

/** A footer link column (anchors and routes both go through next/link). */
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

/**
 * The pipeline as a horizontal flow rail: numbered stage chips left-to-right,
 * connected by arrows and wrapping to the next line. The two standalone
 * artifacts hang as a small tag beneath their stage.
 */
function PipelineTree() {
  return (
    <ol className="flex flex-wrap items-start gap-x-2 gap-y-10">
      {PIPELINE_TREE.map((node, i) => {
        const last = i === PIPELINE_TREE.length - 1;
        return (
          <li key={node.label} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <StageChip index={i} node={node} />
              {!last && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
              )}
            </div>
            {node.branch && (
              <div className="flex flex-col items-start pl-4">
                <span className="ml-1 h-3 w-px bg-primary/40" />
                <BranchChip branch={node.branch} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A gated stage chip in the flow. */
function StageChip({ index, node }: { index: number; node: TreeNode }) {
  const Icon = node.icon;
  return (
    <div
      title={node.desc}
      className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/50"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="pr-1">
        <div className="font-mono text-[10px] leading-none text-muted-foreground">
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className="text-sm font-semibold leading-tight">{node.label}</div>
      </div>
    </div>
  );
}

/** A standalone artifact hanging off a stage (dashed = not gated). */
function BranchChip({ branch }: { branch: NonNullable<TreeNode['branch']> }) {
  const Icon = branch.icon;
  return (
    <div
      title={branch.desc}
      className="flex items-center gap-1.5 rounded-md border border-dashed border-primary/40 bg-primary/5 px-2 py-1"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="text-xs font-semibold">{branch.label}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-primary/70">
        standalone
      </span>
    </div>
  );
}

export function LandingPage() {
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
          <div className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#pipeline" className="transition-colors hover:text-foreground">
              Pipeline
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">
                Start building <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero — states the value prop in one glance */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-6 sm:pb-14 sm:pt-20 lg:px-8 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI Software Architecture Generator
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.75rem]">
            Describe your idea.{' '}
            <span className="bg-gradient-to-r from-primary to-[hsl(var(--success))] bg-clip-text text-transparent">
              Get a complete system design.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Archivato interviews you about your app, then generates the whole
            blueprint — requirements, architecture, database, API, a scored
            review, and a build roadmap. You edit, refine, and export. Not a
            chatbot; an architecture engine.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Start building <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#how">See how it works</a>
            </Button>
          </div>
        </div>

        {/* Looping build demo — idea → product, like a short screen recording */}
        <div className="mx-auto mt-12 max-w-5xl sm:mt-14">
          <IdeaToProductDemo />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            A looping demo — watch an idea become a complete system design.
          </p>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
          <Kicker>The pipeline</Kicker>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            One idea flows through eight gated stages.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            The core stages run as a gated trunk — nothing generates until the
            stage before it exists and you&apos;ve confirmed the interview. Two
            standalone views branch off: Product Vision from the interview, and
            the Roadmap from the finished design.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-border bg-card" />
              gated stage
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-primary/40 bg-primary/5" />
              standalone branch
            </span>
          </div>

          <div className="mt-10">
            <PipelineTree />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Kicker>Everything in the box</Kicker>
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
          A full design studio, not a single answer.
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Every stage produces a real, editable artifact — and the standalone
          views (vision, roadmap, review) frame it for the people who need them.
        </p>

        <div className="mt-12 space-y-12">
          {FEATURE_GROUPS.map((group) => (
            <div key={group.label} className="grid gap-6 md:grid-cols-[13rem_1fr]">
              <div className="md:pt-1">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
                  {group.kicker}
                </div>
                <h3 className="mt-1.5 text-lg font-semibold tracking-tight">
                  {group.label}
                </h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map(({ title, body, icon: Icon }) => (
                  <div
                    key={title}
                    className="group rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h4 className="mt-3 text-sm font-semibold">{title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">{body}</p>
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
          <Kicker>How it works</Kicker>
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight">
            From a sentence to a shippable design.
          </h2>

          {/* Artistic staggered flow: giant gradient numerals alternate across a
              dashed center thread; stacks to a simple column on mobile. */}
          <div className="relative mt-14 space-y-12 md:space-y-0 md:before:absolute md:before:inset-y-6 md:before:left-1/2 md:before:w-px md:before:-translate-x-1/2 md:before:border-l md:before:border-dashed md:before:border-border">
            {STEPS.map((step, i) => {
              const alt = i % 2 === 1;
              return (
                <div
                  key={step.n}
                  className="relative md:grid md:min-h-[10rem] md:grid-cols-2 md:items-center md:gap-12"
                >
                  {/* node on the center thread */}
                  <span className="absolute left-1/2 top-1/2 hidden h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background md:block" />

                  {/* oversized numeral */}
                  <div
                    className={cn(
                      'flex',
                      alt ? 'md:order-2 md:justify-start md:pl-12' : 'md:justify-end md:pr-12',
                    )}
                  >
                    <span
                      className="select-none bg-gradient-to-br from-primary to-[hsl(var(--success))] bg-clip-text font-black leading-none text-transparent"
                      style={{ fontSize: 'clamp(4rem, 11vw, 8.5rem)' }}
                    >
                      {step.n}
                    </span>
                  </div>

                  {/* copy */}
                  <div
                    className={cn(
                      'mt-3 md:mt-0',
                      alt ? 'md:order-1 md:pr-12 md:text-right' : 'md:pl-12',
                    )}
                  >
                    <div className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
                      Step {step.n}
                    </div>
                    <h3 className="mt-2 text-xl font-bold tracking-tight">
                      {step.title}
                    </h3>
                    <p
                      className={cn(
                        'mt-2 text-muted-foreground md:max-w-sm',
                        alt && 'md:ml-auto',
                      )}
                    >
                      {step.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Manifesto / unconventional positioning */}
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
            {'// not a chatbot'}
          </p>
          <h2 className="mx-auto mt-5 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Most AI tools hand you a wall of text.{' '}
            <span className="bg-gradient-to-r from-primary to-[hsl(var(--success))] bg-clip-text text-transparent">
              Archivato hands you a system to build from.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Structured, versioned, reviewable artifacts — the exact things an
            engineering team would actually build from.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Design your system <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/register">Create an account</Link>
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
                Turn a business idea into a complete software system design — not
                a chatbot, an architecture engine.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/dashboard">
                  Start building <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <FooterCol
              title="Explore"
              links={[
                ['Pipeline', '#pipeline'],
                ['Features', '#features'],
                ['How it works', '#how'],
              ]}
            />
            <FooterCol
              title="Account"
              links={[
                ['Sign in', '/login'],
                ['Create account', '/register'],
                ['Dashboard', '/dashboard'],
              ]}
            />
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
            <span>© {new Date().getFullYear()} Archivato AI Builder</span>
            <span className="font-mono">AI Software Architecture Generator</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

