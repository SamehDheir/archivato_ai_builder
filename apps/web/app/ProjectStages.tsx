'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type {
  ApiDesign,
  DatabaseDesign,
  PipelineStageName,
  ProjectSnapshot,
  RefineResult,
  RequirementDocument,
  RequirementsSummary,
  ReviewReport,
  SystemDesign,
} from '@archivato/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RequirementDocumentView } from './RequirementDocumentView';
import { RequirementDocumentEditor } from './RequirementDocumentEditor';
import { SystemDesignView } from './SystemDesignView';
import { SystemDesignEditor } from './SystemDesignEditor';
import { DatabaseDesignView } from './DatabaseDesignView';
import { DatabaseDesignEditor } from './DatabaseDesignEditor';
import { ApiDesignView } from './ApiDesignView';
import { ApiDesignEditor } from './ApiDesignEditor';
import { ReviewView } from './ReviewView';
import { ExportView } from './ExportView';
import { OpenApiView } from './OpenApiView';
import { ChatPanel } from './ChatPanel';
import { VersionHistory } from './VersionHistory';
import { DiagramsView } from './DiagramsView';
import { SummaryView } from './SummaryView';

export type ActiveJob = { stage: PipelineStageName; progress: number };

const STAGE_LABEL: Record<PipelineStageName, string> = {
  requirements: 'requirement document',
  'system-design': 'system design',
  'database-design': 'database design',
  'api-design': 'API design',
  review: 'AI review',
};

type TabKey =
  | 'requirements'
  | 'system'
  | 'database'
  | 'api'
  | 'diagrams'
  | 'review'
  | 'export'
  | 'apidocs'
  | 'refine'
  | 'history';

/**
 * The confirmed pipeline as tabs: one stage visible at a time (instead of one
 * long vertical stack). Downstream tabs are disabled until their prerequisite
 * artifact exists; each tab generates its own stage and links to the next.
 */
export function ProjectStages({
  sessionId,
  summary,
  doc,
  design,
  dbDesign,
  apiDesign,
  review,
  busy,
  job,
  error,
  versionsReload,
  onGenerateRequirements,
  onGenerateSystem,
  onGenerateDatabase,
  onGenerateApi,
  onGenerateReview,
  onSavedDoc,
  onSavedDesign,
  onSavedDbDesign,
  onSavedApiDesign,
  onRefined,
  onRestored,
}: {
  sessionId: string;
  summary: RequirementsSummary | null;
  doc: RequirementDocument | null;
  design: SystemDesign | null;
  dbDesign: DatabaseDesign | null;
  apiDesign: ApiDesign | null;
  review: ReviewReport | null;
  busy: boolean;
  job: ActiveJob | null;
  error: string | null;
  versionsReload: number;
  onGenerateRequirements: () => void;
  onGenerateSystem: () => void;
  onGenerateDatabase: () => void;
  onGenerateApi: () => void;
  onGenerateReview: () => void;
  onSavedDoc: (doc: RequirementDocument) => void;
  onSavedDesign: (design: SystemDesign) => void;
  onSavedDbDesign: (design: DatabaseDesign) => void;
  onSavedApiDesign: (design: ApiDesign) => void;
  onRefined: (result: RefineResult) => void;
  onRestored: (snapshot: ProjectSnapshot) => void;
}) {
  const [tab, setTab] = useState<TabKey>('requirements');
  // Which stage tab is currently in edit mode (null = viewing).
  const [editing, setEditing] = useState<TabKey | null>(null);

  const available: Record<TabKey, boolean> = {
    requirements: true,
    system: !!doc,
    database: !!design,
    api: !!dbDesign,
    diagrams: !!design,
    review: !!apiDesign,
    export: !!apiDesign,
    apidocs: !!apiDesign,
    refine: !!apiDesign,
    history: !!doc,
  };

  // If a restore removes the artifact behind the active tab, fall back to the
  // requirements tab so the panel never goes blank. Also exit any edit mode so a
  // restored/regenerated artifact isn't being edited against stale state.
  useEffect(() => {
    if (!available[tab]) setTab('requirements');
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, design, dbDesign, apiDesign]);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Badge className="gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Requirements confirmed
        </Badge>

        {job && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Generating {STAGE_LABEL[job.stage]}…</span>
              <span>{job.progress}%</span>
            </div>
            <Progress value={job.progress} />
          </div>
        )}

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as TabKey);
            setEditing(null);
          }}
        >
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="requirements">Requirements</TabsTrigger>
            <TabsTrigger value="system" disabled={!available.system}>
              System
            </TabsTrigger>
            <TabsTrigger value="database" disabled={!available.database}>
              Database
            </TabsTrigger>
            <TabsTrigger value="api" disabled={!available.api}>
              API
            </TabsTrigger>
            <TabsTrigger value="diagrams" disabled={!available.diagrams}>
              Diagrams
            </TabsTrigger>
            <TabsTrigger value="review" disabled={!available.review}>
              Review
            </TabsTrigger>
            <TabsTrigger value="export" disabled={!available.export}>
              Export
            </TabsTrigger>
            <TabsTrigger value="apidocs" disabled={!available.apidocs}>
              API Docs
            </TabsTrigger>
            <TabsTrigger value="refine" disabled={!available.refine}>
              Refine
            </TabsTrigger>
            <TabsTrigger value="history" disabled={!available.history}>
              History
            </TabsTrigger>
          </TabsList>

          {/* Requirements */}
          <TabsContent value="requirements" className="mt-4 space-y-3">
            {!doc ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Generate the formal Requirement Document from this interview.
                </p>
                {summary && <SummaryView summary={summary} />}
                <Button onClick={onGenerateRequirements} disabled={busy}>
                  {busy ? 'Generating…' : 'Generate Requirement Document'}
                </Button>
              </>
            ) : editing === 'requirements' ? (
              <RequirementDocumentEditor
                doc={doc}
                sessionId={sessionId}
                onSaved={(d) => {
                  onSavedDoc(d);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <RequirementDocumentView doc={doc} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateRequirements}
                  onEdit={() => setEditing('requirements')}
                  next={{ label: 'System Design', go: () => setTab('system') }}
                />
              </>
            )}
          </TabsContent>

          {/* System design */}
          <TabsContent value="system" className="mt-4 space-y-3">
            {!design ? (
              <GenerateStage
                hint="Design the system architecture from the requirements."
                busy={busy}
                label="Generate System Design"
                onGenerate={onGenerateSystem}
              />
            ) : editing === 'system' ? (
              <SystemDesignEditor
                design={design}
                sessionId={sessionId}
                onSaved={(d) => {
                  onSavedDesign(d);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <SystemDesignView design={design} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateSystem}
                  onEdit={() => setEditing('system')}
                  next={{ label: 'Database', go: () => setTab('database') }}
                />
              </>
            )}
          </TabsContent>

          {/* Database design */}
          <TabsContent value="database" className="mt-4 space-y-3">
            {!dbDesign ? (
              <GenerateStage
                hint="Design the database schema from the services and roles."
                busy={busy}
                label="Generate Database Design"
                onGenerate={onGenerateDatabase}
              />
            ) : editing === 'database' ? (
              <DatabaseDesignEditor
                design={dbDesign}
                sessionId={sessionId}
                onSaved={(d) => {
                  onSavedDbDesign(d);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <DatabaseDesignView design={dbDesign} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateDatabase}
                  onEdit={() => setEditing('database')}
                  next={{ label: 'API', go: () => setTab('api') }}
                />
              </>
            )}
          </TabsContent>

          {/* API design */}
          <TabsContent value="api" className="mt-4 space-y-3">
            {!apiDesign ? (
              <GenerateStage
                hint="Design the REST API from the entities and services."
                busy={busy}
                label="Generate API Design"
                onGenerate={onGenerateApi}
              />
            ) : editing === 'api' ? (
              <ApiDesignEditor
                design={apiDesign}
                sessionId={sessionId}
                onSaved={(d) => {
                  onSavedApiDesign(d);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <ApiDesignView design={apiDesign} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateApi}
                  onEdit={() => setEditing('api')}
                  next={{ label: 'Review', go: () => setTab('review') }}
                />
              </>
            )}
          </TabsContent>

          {/* Architecture diagrams */}
          <TabsContent value="diagrams" className="mt-4">
            <DiagramsView sessionId={sessionId} reloadKey={versionsReload} />
          </TabsContent>

          {/* Review */}
          <TabsContent value="review" className="mt-4 space-y-3">
            {!review ? (
              <GenerateStage
                hint="Run the AI review of the whole system."
                busy={busy}
                label="Run AI Review"
                onGenerate={onGenerateReview}
              />
            ) : (
              <>
                <ReviewView report={review} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateReview}
                  regenerateLabel="Regenerate review"
                  next={{ label: 'Export', go: () => setTab('export') }}
                />
              </>
            )}
          </TabsContent>

          {/* Export */}
          <TabsContent value="export" className="mt-4">
            <ExportView sessionId={sessionId} />
          </TabsContent>

          {/* API Docs (Swagger UI) */}
          <TabsContent value="apidocs" className="mt-4">
            <OpenApiView sessionId={sessionId} reloadKey={versionsReload} />
          </TabsContent>

          {/* Refine (chat) */}
          <TabsContent value="refine" className="mt-4">
            <ChatPanel sessionId={sessionId} onRefined={onRefined} />
          </TabsContent>

          {/* Version history */}
          <TabsContent value="history" className="mt-4">
            <VersionHistory
              sessionId={sessionId}
              reloadKey={versionsReload}
              onRestored={onRestored}
            />
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function GenerateStage({
  hint,
  label,
  busy,
  onGenerate,
}: {
  hint: string;
  label: string;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Button onClick={onGenerate} disabled={busy}>
        {busy ? 'Working…' : label}
      </Button>
    </>
  );
}

function StageActions({
  busy,
  onRegenerate,
  onEdit,
  regenerateLabel = 'Regenerate',
  next,
}: {
  busy: boolean;
  onRegenerate: () => void;
  onEdit?: () => void;
  regenerateLabel?: string;
  next?: { label: string; go: () => void };
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {onEdit && (
        <Button variant="secondary" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
      )}
      <Button variant="secondary" onClick={onRegenerate} disabled={busy}>
        {regenerateLabel}
      </Button>
      {next && (
        <Button onClick={next.go} disabled={busy}>
          Next: {next.label} →
        </Button>
      )}
    </div>
  );
}
