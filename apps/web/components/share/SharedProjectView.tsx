'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  ClipboardCheck,
  Database as DatabaseIcon,
  FileText,
  Network,
  Sparkles,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import type { SharedProject } from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToastProvider } from '@/components/shared/toast';
import { Logo } from '@/components/shared/Logo';
import { RequirementDocumentView } from '@/components/design/RequirementDocumentView';
import { SystemDesignView } from '@/components/design/SystemDesignView';
import { DatabaseDesignView } from '@/components/design/DatabaseDesignView';
import { ApiDesignView } from '@/components/design/ApiDesignView';
import { ReviewView } from '@/components/review/ReviewView';
import { loadShareNamespaces } from '@/lib/i18n/client';

type ShareTab = 'requirements' | 'system' | 'database' | 'api' | 'review';

const TABS: { value: ShareTab; icon: LucideIcon }[] = [
  { value: 'requirements', icon: FileText },
  { value: 'system', icon: Network },
  { value: 'database', icon: DatabaseIcon },
  { value: 'api', icon: Webhook },
  { value: 'review', icon: ClipboardCheck },
];

/**
 * Design facts worth putting above the fold — the "this is real" proof. The
 * endpoint count is dropped rather than shown as 0 when the owner shared from the
 * free tier (no API design): a zero here would read as "this design has no API",
 * which is a claim about the design rather than about the plan that made it.
 */
function stats(project: SharedProject) {
  return [
    {
      key: 'architecture' as const,
      value: project.systemDesign.architecture.replace(/_/g, ' '),
    },
    { key: 'services' as const, value: project.systemDesign.services.length },
    { key: 'tables' as const, value: project.databaseDesign.entities.length },
    ...(project.apiDesign
      ? [
          {
            key: 'endpoints' as const,
            value: project.apiDesign.modules.reduce(
              (n, m) => n + m.endpoints.length,
              0,
            ),
          },
        ]
      : []),
  ];
}

/**
 * The public, read-only page behind a share link. It renders the **same artifact
 * views the owner sees** (the `ExampleProjectView` pattern — the views are pure
 * functions of their artifact, so they need no session), wrapped in a light,
 * unauthenticated chrome that ends in a "Built with Archivato" CTA. That CTA is
 * the point: the reader is a stranger looking at proof of what the product does.
 *
 * The page lives outside the `(app)` route group, so none of the app's providers
 * are mounted. It supplies the one it actually needs — `ToastProvider`, for the
 * ER-diagram export buttons — and nothing else: no AuthGate, no billing, no
 * account chrome.
 */
export function SharedProjectView({ project }: { project: SharedProject }) {
  // The artifact views read the `stages` namespace, which is not in the eager
  // (public) i18n tier. Hold the first render until it lands so the page never
  // flashes raw translation keys at someone seeing the product for the first time.
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

  // Both trailing stages are Pro. A free owner's link carries neither, and the
  // page simply renders the design it does have rather than an empty tab.
  const has: Record<ShareTab, boolean> = {
    requirements: true,
    system: true,
    database: true,
    api: !!project.apiDesign,
    review: !!project.review,
  };
  const tiles = stats(project);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" aria-label="Archivato">
            <Logo />
          </Link>
          <Badge variant="secondary">{t('badge')}</Badge>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold sm:text-3xl" dir="auto">
            {project.title}
          </h1>
          <p className="text-sm text-muted-foreground" dir="auto">
            {project.idea.idea}
          </p>
        </div>

        <dl
          className={`grid grid-cols-2 gap-3 ${
            tiles.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
          }`}
        >
          {tiles.map(({ key, value }) => (
            <div key={key} className="rounded-lg border bg-card p-3">
              <dt className="text-xs text-muted-foreground">
                {t(`stat.${key}`)}
              </dt>
              <dd className="mt-0.5 truncate text-lg font-semibold capitalize">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="text-xs text-muted-foreground">{t('readonly')}</p>
      </header>

      <Card>
        <CardContent className="p-5">
          <Tabs defaultValue="system">
            <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto md:flex-wrap md:overflow-visible">
              {TABS.filter(({ value }) => has[value]).map(
                ({ value, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="shrink-0 gap-1.5"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t(`tab.${value}`)}
                  </TabsTrigger>
                ),
              )}
            </TabsList>

            <TabsContent value="requirements" className="mt-4">
              <RequirementDocumentView doc={project.requirements} />
            </TabsContent>
            <TabsContent value="system" className="mt-4">
              {/* `interactive` off: "Explain this decision" calls an owner-scoped
                  API, which a link holder has no session for. */}
              <SystemDesignView
                design={project.systemDesign}
                interactive={false}
              />
            </TabsContent>
            <TabsContent value="database" className="mt-4">
              <DatabaseDesignView design={project.databaseDesign} />
            </TabsContent>
            {project.apiDesign && (
              <TabsContent value="api" className="mt-4">
                <ApiDesignView design={project.apiDesign} />
              </TabsContent>
            )}
            {project.review && (
              <TabsContent value="review" className="mt-4">
                <ReviewView report={project.review} />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <ShareCta />
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
          <p className="max-w-2xl text-sm text-muted-foreground">
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

function SharedProjectSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
