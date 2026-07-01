'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Database as DatabaseIcon,
  FileText,
  Network,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
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
import { DesignCanvas } from './DesignCanvas';
import { EmptyState } from './EmptyState';
import { SummaryView } from './SummaryView';

export type ActiveJob = { stage: PipelineStageName; progress: number };

const STAGE_LABEL: Record<PipelineStageName, string> = {
  requirements: 'requirement document',
  'system-design': 'system design',
  'database-design': 'database design',
  'api-design': 'API design',
  review: 'AI review',
};

export type TabKey =
  | 'requirements'
  | 'system'
  | 'database'
  | 'api'
  | 'diagrams'
  | 'canvas'
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
  tab,
  onTabChange,
  dirty,
  onDirty,
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
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  /** Whether the open editor/canvas currently has unsaved edits. */
  dirty: boolean;
  /** Report whether the open editor/canvas has unsaved edits (drives the guard). */
  onDirty: (dirty: boolean) => void;
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
  // `tab` is controlled by the parent (so the Project Wizard can navigate to a
  // stage); `setTab` is just an alias to the parent's setter.
  const setTab = onTabChange;
  // Which stage tab is currently in edit mode (null = viewing).
  const [editing, setEditing] = useState<TabKey | null>(null);

  const available: Record<TabKey, boolean> = {
    requirements: true,
    system: !!doc,
    database: !!design,
    api: !!dbDesign,
    diagrams: !!design,
    canvas: !!design,
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
    onDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, design, dbDesign, apiDesign]);

  // Leaving a stage tab exits any open editor (the leave guard already ran in
  // the parent, so a confirmed switch discards the draft).
  useEffect(() => {
    setEditing(null);
    onDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="sticky top-16 z-30 flex h-auto flex-wrap justify-start gap-1 shadow-sm">
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
            <TabsTrigger value="canvas" disabled={!available.canvas}>
              Canvas
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
                <EmptyState
                  icon={FileText}
                  title="Generate the requirement document"
                  description="Turn this interview into a formal document: functional & non-functional requirements, user roles, business rules, constraints, and assumptions."
                >
                  <Button onClick={onGenerateRequirements} disabled={busy}>
                    {busy ? 'Generating…' : 'Generate Requirement Document'}
                  </Button>
                </EmptyState>
                {summary && (
                  <div className="mt-2">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Interview preview
                    </p>
                    <SummaryView summary={summary} />
                  </div>
                )}
              </>
            ) : editing === 'requirements' ? (
              <RequirementDocumentEditor
                doc={doc}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedDoc(d);
                  setEditing(null);
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <RequirementDocumentView doc={doc} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateRequirements}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('requirements');
                  }}
                  next={{ label: 'System Design', go: () => setTab('system') }}
                />
              </>
            )}
          </TabsContent>

          {/* System design */}
          <TabsContent value="system" className="mt-4 space-y-3">
            {!design ? (
              <GenerateStage
                icon={Network}
                title="Design the architecture"
                hint="Turn the requirements into an architecture: the pattern (monolith / microservices), a tech stack, and the service modules."
                busy={busy}
                label="Generate System Design"
                onGenerate={onGenerateSystem}
              />
            ) : editing === 'system' ? (
              <SystemDesignEditor
                design={design}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedDesign(d);
                  setEditing(null);
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <SystemDesignView design={design} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateSystem}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('system');
                  }}
                  next={{ label: 'Database', go: () => setTab('database') }}
                />
              </>
            )}
          </TabsContent>

          {/* Database design */}
          <TabsContent value="database" className="mt-4 space-y-3">
            {!dbDesign ? (
              <GenerateStage
                icon={DatabaseIcon}
                title="Design the database"
                hint="Derive the schema — entities, columns, primary/foreign keys, and relationships — from the services and roles."
                busy={busy}
                label="Generate Database Design"
                onGenerate={onGenerateDatabase}
              />
            ) : editing === 'database' ? (
              <DatabaseDesignEditor
                design={dbDesign}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedDbDesign(d);
                  setEditing(null);
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <DatabaseDesignView design={dbDesign} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateDatabase}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('database');
                  }}
                  next={{ label: 'API', go: () => setTab('api') }}
                />
              </>
            )}
          </TabsContent>

          {/* API design */}
          <TabsContent value="api" className="mt-4 space-y-3">
            {!apiDesign ? (
              <GenerateStage
                icon={Webhook}
                title="Design the API"
                hint="Generate the REST API — endpoints grouped by module, with request/response schemas and status codes — from the entities and services."
                busy={busy}
                label="Generate API Design"
                onGenerate={onGenerateApi}
              />
            ) : editing === 'api' ? (
              <ApiDesignEditor
                design={apiDesign}
                sessionId={sessionId}
                onDirty={() => onDirty(true)}
                onSaved={(d) => {
                  onDirty(false);
                  onSavedApiDesign(d);
                  setEditing(null);
                }}
                onCancel={() => {
                  onDirty(false);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <ApiDesignView design={apiDesign} />
                <StageActions
                  busy={busy}
                  onRegenerate={onGenerateApi}
                  onEdit={() => {
                    onDirty(false);
                    setEditing('api');
                  }}
                  next={{ label: 'Review', go: () => setTab('review') }}
                />
              </>
            )}
          </TabsContent>

          {/* Architecture diagrams */}
          <TabsContent value="diagrams" className="mt-4">
            <DiagramsView sessionId={sessionId} reloadKey={versionsReload} />
          </TabsContent>

          {/* Interactive canvas (React Flow) */}
          <TabsContent value="canvas" className="mt-4">
            <DesignCanvas
              sessionId={sessionId}
              design={design}
              dbDesign={dbDesign}
              dirty={dirty}
              onDirty={onDirty}
              onSavedDesign={onSavedDesign}
              onSavedDbDesign={onSavedDbDesign}
            />
          </TabsContent>

          {/* Review */}
          <TabsContent value="review" className="mt-4 space-y-3">
            {!review ? (
              <GenerateStage
                icon={ClipboardCheck}
                title="Review the whole system"
                hint="Run the AI architecture review: a scalability score, security & performance findings, missing features, and recommendations."
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
  icon,
  title,
  hint,
  label,
  busy,
  onGenerate,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  label: string;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <EmptyState icon={icon} title={title} description={hint}>
      <Button onClick={onGenerate} disabled={busy}>
        {busy ? 'Working…' : label}
      </Button>
    </EmptyState>
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
