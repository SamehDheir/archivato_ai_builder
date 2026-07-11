'use client';

import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  Coins,
  Database as DatabaseIcon,
  FileText,
  Flag,
  FlaskConical,
  Network,
  ShieldAlert,
  Sparkles,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SummaryView } from '@/components/interview/SummaryView';
import { RequirementDocumentView } from '@/components/design/RequirementDocumentView';
import { SystemDesignView } from '@/components/design/SystemDesignView';
import { DatabaseDesignView } from '@/components/design/DatabaseDesignView';
import { ApiDesignView } from '@/components/design/ApiDesignView';
import { ReviewView } from '@/components/review/ReviewView';
import { ProductVisionView } from '@/components/product/ProductVisionView';
import { RoadmapView } from '@/components/roadmap/RoadmapView';
import { CostView } from '@/components/cost/CostView';
import { ThreatModelView } from '@/components/security/ThreatModelView';
import { QaPlanView } from '@/components/qa/QaPlanView';
import {
  EXAMPLE_API_DESIGN,
  EXAMPLE_COST_ESTIMATE,
  EXAMPLE_DATABASE_DESIGN,
  EXAMPLE_QA_PLAN,
  EXAMPLE_REQUIREMENTS,
  EXAMPLE_REVIEW,
  EXAMPLE_ROADMAP,
  EXAMPLE_SUMMARY,
  EXAMPLE_SYSTEM_DESIGN,
  EXAMPLE_THREAT_MODEL,
  EXAMPLE_VISION,
} from '@/lib/example-project';

type ExampleTab =
  | 'summary'
  | 'vision'
  | 'requirements'
  | 'system'
  | 'database'
  | 'api'
  | 'review'
  | 'roadmap'
  | 'cost'
  | 'threat'
  | 'qa';

/**
 * Every agent the pipeline runs, in the same order (and with the same icons) as
 * the real `ProjectStages` tab bar — so the tour previews the whole product, not
 * just the design chain. Diagrams/Canvas/Export are deliberately absent: they
 * render from a live session, and the example is backend-free by design.
 */
const TABS: { value: ExampleTab; icon: LucideIcon }[] = [
  { value: 'summary', icon: BookOpen },
  { value: 'vision', icon: Sparkles },
  { value: 'requirements', icon: FileText },
  { value: 'system', icon: Network },
  { value: 'database', icon: DatabaseIcon },
  { value: 'api', icon: Webhook },
  { value: 'review', icon: ClipboardCheck },
  { value: 'roadmap', icon: Flag },
  { value: 'cost', icon: Coins },
  { value: 'threat', icon: ShieldAlert },
  { value: 'qa', icon: FlaskConical },
];

/**
 * A read-only tour of a finished sample project. It reuses the same artifact
 * `*View` components as the real pipeline but renders from a static fixture —
 * no backend calls, no editing, no quota impact. Its job is to sell the payoff
 * before the interview: the user sees exactly what Archivato produces, then
 * starts their own.
 */
export function ExampleProjectView({
  onClose,
  onStartOwn,
}: {
  /** Return to the projects dashboard. */
  onClose: () => void;
  /** Leave the example and open the new-project form. */
  onStartOwn: () => void;
}) {
  const { t } = useTranslation('dashboard');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t('example.badge')}</Badge>
            <h2 className="truncate text-lg font-semibold" dir="auto">
              {t('example.name')}
            </h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" />
            {t('example.close')}
          </Button>
          <Button onClick={onStartOwn}>
            <Sparkles className="h-4 w-4" />
            {t('example.startOwn')}
          </Button>
        </div>
      </div>

      <Alert variant="info">
        <AlertDescription>{t('example.intro')}</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="space-y-4 p-5">
          <Tabs defaultValue="summary">
            <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto md:flex-wrap md:overflow-visible">
              {TABS.map(({ value, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="shrink-0 gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {t(`example.tab.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="summary" className="mt-4">
              <SummaryView summary={EXAMPLE_SUMMARY} />
            </TabsContent>
            <TabsContent value="vision" className="mt-4">
              <ProductVisionView vision={EXAMPLE_VISION} />
            </TabsContent>
            <TabsContent value="requirements" className="mt-4">
              <RequirementDocumentView doc={EXAMPLE_REQUIREMENTS} />
            </TabsContent>
            <TabsContent value="system" className="mt-4">
              <SystemDesignView design={EXAMPLE_SYSTEM_DESIGN} interactive={false} />
            </TabsContent>
            <TabsContent value="database" className="mt-4">
              <DatabaseDesignView design={EXAMPLE_DATABASE_DESIGN} />
            </TabsContent>
            <TabsContent value="api" className="mt-4">
              <ApiDesignView design={EXAMPLE_API_DESIGN} />
            </TabsContent>
            <TabsContent value="review" className="mt-4">
              <ReviewView report={EXAMPLE_REVIEW} />
            </TabsContent>
            <TabsContent value="roadmap" className="mt-4">
              <RoadmapView roadmap={EXAMPLE_ROADMAP} />
            </TabsContent>
            <TabsContent value="cost" className="mt-4">
              <CostView estimate={EXAMPLE_COST_ESTIMATE} />
            </TabsContent>
            <TabsContent value="threat" className="mt-4">
              <ThreatModelView model={EXAMPLE_THREAT_MODEL} />
            </TabsContent>
            <TabsContent value="qa" className="mt-4">
              <QaPlanView plan={EXAMPLE_QA_PLAN} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
