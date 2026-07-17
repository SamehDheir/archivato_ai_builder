'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Info,
  Languages,
  Moon,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/shared/EmptyState';
import { CATEGORY_LEGEND } from '@/lib/node-category';

/**
 * The living reference for the Archivato design system.
 *
 * Not decoration — it exists so the next person solving a UI problem finds the
 * existing answer instead of inventing a fourth chip style. It renders the REAL
 * components against the REAL tokens, so the theme and direction toggles below
 * exercise them exactly as a customer-facing page would.
 *
 * All copy here is intentionally English and NOT i18n'd: it's an internal
 * dev-only reference (the route 404s in production), and putting it through the
 * translation pipeline would mean shipping its strings in every visitor's
 * locale bundle to serve an audience of one team.
 */
export function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <PageHeader />
      <Palette />
      <Typography />
      <Buttons />
      <Badges />
      <Alerts />
      <Tables />
      <Forms />
      <States />
      <Elevation />
      <Motion />
    </main>
  );
}

function PageHeader() {
  return (
    <header className="space-y-4 border-b border-border pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge variant="muted">Dev only · 404s in production</Badge>
          <h1 className="text-h1 font-semibold">Design system</h1>
          <p className="measure text-body text-muted-foreground">
            Every token and component variant in one place. If a screen needs
            something that isn&apos;t here, add it here first — that&apos;s what
            keeps two screens from solving one problem two ways.
          </p>
        </div>
        <Toggles />
      </div>
      <p className="measure text-small text-muted-foreground">
        <strong className="font-semibold text-foreground">The one rule:</strong>{' '}
        colour means a semantic state or a data category. Never decoration. Raw
        hex and Tailwind palette classes are blocked by ESLint — add a token in{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">globals.css</code>{' '}
        instead.
      </p>
    </header>
  );
}

/**
 * Theme + direction switches. These write straight to the document element
 * rather than going through ThemeProvider/LocaleProvider: this page is a
 * rendering harness, and the point is to flip the two axes that break layouts
 * (dark, RTL) without also loading the Arabic i18n chunk to read English demo
 * copy. The real providers are what ship; this is a test rig.
 */
function Toggles() {
  const [dark, setDark] = useState(true);
  const [rtl, setRtl] = useState(false);

  // Read the real starting state instead of assuming it, so the labels don't lie
  // on first paint for someone whose theme is light.
  useEffect(() => {
    const de = document.documentElement;
    setDark(de.classList.contains('dark'));
    setRtl(de.dir === 'rtl');
  }, []);

  /*
   * These write straight to <html>, bypassing Theme/LocaleProvider — which makes
   * them a LEAK: a client-side nav away from /design keeps the mutated dir/lang,
   * because LocaleProvider only re-applies on a locale change and would never
   * learn this page had meddled. So restore the real state on unmount. (Dev-only
   * page, but "toggled RTL once and now the whole app is backwards until reload"
   * is exactly the kind of ghost that costs an hour to track down.)
   */
  useEffect(() => {
    const de = document.documentElement;
    const original = {
      dark: de.classList.contains('dark'),
      dir: de.dir,
      lang: de.lang,
    };
    return () => {
      de.classList.toggle('dark', original.dark);
      de.dir = original.dir;
      de.lang = original.lang;
    };
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  };

  const toggleDir = () => {
    const next = !rtl;
    setRtl(next);
    document.documentElement.dir = next ? 'rtl' : 'ltr';
    // `lang` is what drives the Arabic font + leading (globals.css keys off it),
    // and it is a separate question from `dir` — so flip both to see what an
    // Arabic reader actually gets.
    document.documentElement.lang = next ? 'ar' : 'en';
  };

  return (
    <div className="flex shrink-0 gap-2">
      <Button variant="secondary" size="sm" onClick={toggleTheme}>
        {dark ? <Moon /> : <Sun />}
        {dark ? 'Dark' : 'Light'}
      </Button>
      <Button variant="secondary" size="sm" onClick={toggleDir}>
        <Languages />
        {rtl ? 'RTL (ar)' : 'LTR (en)'}
      </Button>
    </div>
  );
}

function Sect({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-h3 font-semibold">{title}</h2>
        {lead && <p className="measure text-small text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * The semantic four-token set, spelled out as full class literals so Tailwind's
 * JIT can actually see them (see the note at the call site).
 */
const SEMANTIC_SWATCHES = [
  {
    name: 'success',
    solid: 'bg-success text-success-foreground',
    subtle: 'bg-success-subtle text-success-subtle-foreground',
  },
  {
    name: 'warning',
    solid: 'bg-warning text-warning-foreground',
    subtle: 'bg-warning-subtle text-warning-subtle-foreground',
  },
  {
    name: 'destructive',
    solid: 'bg-destructive text-destructive-foreground',
    subtle: 'bg-destructive-subtle text-destructive-subtle-foreground',
  },
  {
    name: 'info',
    solid: 'bg-info text-info-foreground',
    subtle: 'bg-info-subtle text-info-subtle-foreground',
  },
] as const;

/** One token swatch. `className` is the literal utility a developer copies. */
function Swatch({
  className,
  name,
  note,
}: {
  className: string;
  name: string;
  note?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex h-16 items-center justify-center rounded-md border border-border text-xs font-semibold',
          className,
        )}
      >
        {note}
      </div>
      <code className="block text-micro text-muted-foreground">{name}</code>
    </div>
  );
}

function Palette() {
  return (
    <Sect
      title="Colour"
      lead="One accent (deep teal), spent only on primary actions and progress. Every semantic ships four tokens — a solid fill + text on it, and a subtle surface + text on that. Use the pair; never mix a solid with a subtle-foreground."
    >
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-small font-semibold">Accent &amp; surfaces</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Swatch
              className="bg-primary text-primary-foreground"
              name="primary"
              note="Aa"
            />
            <Swatch
              className="bg-primary-subtle text-primary-subtle-foreground"
              name="primary-subtle"
              note="Aa"
            />
            <Swatch
              className="bg-background text-foreground"
              name="background"
              note="Aa"
            />
            <Swatch className="bg-card text-card-foreground" name="card" note="Aa" />
            <Swatch className="bg-muted text-muted-foreground" name="muted" note="Aa" />
            <Swatch
              className="bg-secondary text-secondary-foreground"
              name="secondary"
              note="Aa"
            />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-small font-semibold">Semantic</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/*
              These class strings are written out in full, NOT built as
              `bg-${name}`. Tailwind's JIT scans source for COMPLETE class
              literals — a constructed name is invisible to it and the utility is
              simply never generated. The first cut of this page did exactly that
              and `bg-info` rendered as an unstyled box, purely because `bg-info`
              happened to be used nowhere else in the app while `bg-success` was.
              A reference page that silently lies about a token is worse than no
              reference page.
            */}
            {SEMANTIC_SWATCHES.map(({ name, solid, subtle }) => (
              <div key={name} className="space-y-3">
                <Swatch className={solid} name={name} note="Aa" />
                <Swatch className={subtle} name={`${name}-subtle`} note="Aa" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-small font-semibold">Categorical data</h3>
          <p className="measure mb-3 text-small text-muted-foreground">
            The canvas node categories — the one place non-semantic hue earns its
            keep, because telling two unordered kinds apart is the whole function.
            If your use isn&apos;t &quot;these are different kinds of thing&quot;,
            you want a semantic token.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_LEGEND.map((c) => (
              <span
                key={c.label}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                  c.border,
                  c.headerBg,
                  c.text,
                )}
              >
                {c.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Sect>
  );
}

function Typography() {
  return (
    <Sect
      title="Typography"
      lead="Inter for Latin, IBM Plex Sans Arabic for Arabic — both self-hosted via next/font. Arabic gets a taller line (1.85 vs 1.6) and no negative tracking; the rules key off [lang], not [dir], because script and layout are different questions. Flip the toggle above to see it."
    >
      <div className="space-y-4 rounded-lg border border-border p-6">
        {(
          [
            ['text-display', 'display', 'Turn a client call into a scoping package'],
            ['text-h1', 'h1', 'Acme Retail — client scoping'],
            ['text-h2', 'h2', 'What we are building'],
            ['text-h3', 'h3', 'Functional requirements'],
            ['text-h4', 'h4', 'Out of scope'],
          ] as const
        ).map(([cls, name, sample]) => (
          <div key={name} className="flex flex-wrap items-baseline gap-4">
            <code className="w-24 shrink-0 text-micro text-muted-foreground">
              {name}
            </code>
            <span className={cn(cls, 'font-semibold')}>{sample}</span>
          </div>
        ))}
        <div className="flex flex-wrap items-baseline gap-4">
          <code className="w-24 shrink-0 text-micro text-muted-foreground">body</code>
          <p className="measure text-body">
            The reading measure is capped at ~70ch — the span the eye tracks
            without losing its place on the return sweep. Long-form artifact prose
            uses <code className="text-xs">.measure</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <code className="w-24 shrink-0 text-micro text-muted-foreground">small</code>
          <p className="text-small text-muted-foreground">
            Secondary copy, help text, metadata.
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-4">
          <code className="w-24 shrink-0 text-micro text-muted-foreground">mono</code>
          <p className="font-mono text-small" dir="ltr">
            GET /api/orders/:id → 200 OK
          </p>
        </div>
      </div>
    </Sect>
  );
}

function Buttons() {
  return (
    <Sect
      title="Buttons"
      lead="Exactly one accent-filled button per view. If a screen has two, one of them is not the primary action."
    >
      <div className="space-y-4 rounded-lg border border-border p-6">
        <div className="flex flex-wrap items-center gap-2">
          {(
            ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const
          ).map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['sm', 'default', 'lg'] as const).map((s) => (
            <Button key={s} size={s} variant="secondary">
              size {s}
            </Button>
          ))}
          <Button disabled>disabled</Button>
        </div>
        <p className="text-small text-muted-foreground">
          Tab through these — every control shows the same 2px accent focus ring,
          set once at the base layer so a new control is keyboard-visible before
          anyone remembers to add the class.
        </p>
      </div>
    </Sect>
  );
}

function Badges() {
  return (
    <Sect
      title="Badges"
      lead="Status pills. Every semantic variant is a subtle surface + its matching foreground, so contrast is a fixed number rather than whatever a translucent tint composited to."
    >
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-6">
        {(
          [
            'default',
            'primary',
            'secondary',
            'warning',
            'destructive',
            'info',
            'muted',
            'outline',
          ] as const
        ).map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </div>
    </Sect>
  );
}

function Alerts() {
  return (
    <Sect
      title="Callouts"
      lead="The icon is positioned with logical properties, so it sits on the correct side in Arabic. Flip the direction toggle to check."
    >
      <div className="space-y-3">
        <Alert variant="info">
          <Info />
          <AlertTitle>Informational</AlertTitle>
          <AlertDescription>Neutral context the user may want.</AlertDescription>
        </Alert>
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>Interview confirmed</AlertTitle>
        </Alert>
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Out of date</AlertTitle>
          <AlertDescription>
            The design changed after this was generated.
          </AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Generation failed</AlertTitle>
        </Alert>
      </div>
    </Sect>
  );
}

/**
 * The artifact table — the component with the most load-bearing responsive
 * behaviour in the app, so it's here to be resized rather than trusted.
 *
 * Narrow the window: this must scroll INSIDE its own box while the page body
 * stays put. It used to compress instead, which is what made the requirements
 * page unreadable on a phone.
 */
function Tables() {
  return (
    <Sect
      title="Data table"
      lead="Wide content scrolls itself; the page body never scrolls sideways. Drag the window narrow — the table gets its own scrollbar and the page doesn't move. (Its ancestor needs min-w-0, or the table's min-width escapes and pushes the page instead.)"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">ID</TableHead>
            <TableHead>Requirement</TableHead>
            <TableHead className="w-24">Priority</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[
            ['FR-1', 'Customers can book an appointment and get a confirmation.', 'must'],
            ['FR-2', 'Staff can see the day’s schedule and reassign a slot.', 'must'],
            ['FR-3', 'Owners can export the month’s bookings as a spreadsheet.', 'could'],
          ].map(([id, req, pri]) => (
            <TableRow key={id}>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {id}
              </TableCell>
              <TableCell>{req}</TableCell>
              <TableCell>
                <Badge variant={pri === 'must' ? 'destructive' : 'secondary'}>
                  {pri}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Sect>
  );
}

function Forms() {
  return (
    <Sect
      title="Form fields"
      lead="One anatomy everywhere: label → control → help or error. Error text replaces help text rather than stacking under it."
    >
      <div className="grid gap-5 rounded-lg border border-border p-6 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ds-a">Client name</Label>
          <Input id="ds-a" dir="auto" placeholder="Acme Retail" />
          <p className="text-micro text-muted-foreground">
            Shown on the dashboard card and the proposal.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ds-b">Weekly rate</Label>
          <Input id="ds-b" dir="ltr" type="number" placeholder="2000" />
          <p className="text-micro text-destructive">Must be a positive number.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="ds-c">Call notes</Label>
          <Textarea id="ds-c" dir="auto" rows={3} placeholder="Paste your notes…" />
        </div>
      </div>
    </Sect>
  );
}

function States() {
  return (
    <Sect
      title="Empty &amp; loading"
      lead="Loading is skeletons shaped like the content that lands, never a spinner — a spinner says 'wait', a skeleton says 'here is what is coming'."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <EmptyState
          icon={FileText}
          title="No scoping document yet"
          description="Generate it from the confirmed interview."
        >
          <Button>Generate</Button>
        </EmptyState>
        <Card>
          <CardHeader>
            <CardTitle className="text-h4">Skeleton</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
            <Progress value={62} className="h-1.5" />
          </CardContent>
        </Card>
      </div>
    </Sect>
  );
}

function Elevation() {
  return (
    <Sect
      title="Elevation"
      lead="Shallow and hue-tinted — a black shadow on a cool surface reads as grey dirt. This is a document tool, not a stack of floating cards."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg'] as const).map((s) => (
          <div
            key={s}
            className={cn(
              'flex h-20 items-center justify-center rounded-lg border border-border bg-card text-micro text-muted-foreground',
              s,
            )}
          >
            {s}
          </div>
        ))}
      </div>
    </Sect>
  );
}

function Motion() {
  return (
    <Sect
      title="Motion"
      lead="150ms for hover/press, 200ms for expand/collapse, 300ms ceiling. Ease-out only. No entrance animations, no parallax — anything slower reads as lag, not polish."
    >
      <div className="flex flex-wrap gap-4 rounded-lg border border-border p-6">
        {(
          [
            ['duration-fast', '150ms — hover, press, colour'],
            ['duration-base', '200ms — expand, reveal'],
            ['duration-slow', '300ms — ceiling'],
          ] as const
        ).map(([cls, label]) => (
          <div
            key={cls}
            className={cn(
              'cursor-pointer rounded-lg border border-border bg-card px-4 py-3 text-small ease-out hover:-translate-y-0.5 hover:border-primary hover:shadow-md',
              'transition-all',
              cls,
            )}
          >
            <code className="text-micro text-muted-foreground">{cls}</code>
            <div>{label}</div>
          </div>
        ))}
      </div>
    </Sect>
  );
}
