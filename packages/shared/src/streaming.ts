/**
 * Streaming generation — the "narration layer".
 *
 * Our pipeline artifacts are structured JSON produced via `completeJson<T>()`,
 * and every agent has a deterministic fallback (so mock mode / a failed model
 * call still yield a full artifact with ZERO tokens). Streaming raw JSON would
 * therefore look ugly mid-generation and show nothing at all offline.
 *
 * Instead we stream a human-readable *narration* of what the stage produced.
 * `buildNarration()` is a pure, deterministic function of the finished artifact
 * (mirroring `estimateCosts()` / `buildBackendScaffold()`): the server runs the
 * real `generate()`, then this builder turns the result into an ordered list of
 * readable steps, which the SSE layer types out token-by-token. Because the
 * narration is derived from data — not from the LLM — it reads identically in
 * mock mode and with a real provider.
 *
 * This module is runtime-free (no Node/Nest imports) so it can be unit-tested
 * offline and imported by both the API and the web client.
 */

import { PIPELINE_STAGES, type PipelineStageName } from './jobs';
import type { RequirementDocument } from './requirements';
import type { SystemDesign } from './system-design';
import type { DatabaseDesign } from './database-design';
import type { ApiDesign } from './api-design';
import type { ReviewReport } from './review';
import type { BusinessAnalysis } from './business-analysis';
import type { ProductVision } from './product-vision';
import type { ProjectRoadmap } from './roadmap';
import type { ThreatModel } from './threat-model';
import type { QaPlan } from './qa-plan';

/**
 * The standalone stages — the ones that hang off the confirmed session without
 * gating, or being gated by, the design chain.
 *
 * They are deliberately NOT added to `PipelineStageName`. That type means "a
 * stage the BullMQ worker runs and the version snapshot covers", and both halves
 * of that are load-bearing: these artifacts are excluded from version snapshots
 * on purpose, so widening the pipeline type to reach them would quietly start
 * cutting snapshots for artifacts a restore must not rewind.
 *
 * The **cost estimate is absent on purpose**. It is 100% deterministic — zero
 * LLM calls, `estimateCosts()` returns in milliseconds — so there is no waiting
 * to narrate. Streaming it would stage a performance of work that never happened
 * and imply a model was involved, which is the same reason it carries no
 * `generation` provenance stamp.
 */
export type StandaloneStageName =
  | 'business-analysis'
  | 'product-vision'
  | 'roadmap'
  | 'threat-model'
  | 'qa-plan';

export const STANDALONE_STAGES: readonly StandaloneStageName[] = [
  'business-analysis',
  'product-vision',
  'roadmap',
  'threat-model',
  'qa-plan',
] as const;

/** Every stage that can be generated live over SSE. */
export type StreamStageName = PipelineStageName | StandaloneStageName;

export const STREAM_STAGES: readonly StreamStageName[] = [
  ...PIPELINE_STAGES,
  ...STANDALONE_STAGES,
] as const;

export function isStreamStage(value: string): value is StreamStageName {
  return (STREAM_STAGES as readonly string[]).includes(value);
}

export function isStandaloneStage(
  stage: StreamStageName,
): stage is StandaloneStageName {
  return (STANDALONE_STAGES as readonly string[]).includes(stage);
}

/** One phase of the narration: a headline `label` and optional multi-line `body`. */
export interface NarrationStep {
  /** Stable id within a run, e.g. "roles" or "fr". */
  id: string;
  /** Short headline shown as the step title, e.g. "Deriving functional requirements". */
  label: string;
  /** Optional detail typed out under the headline (may be multi-line). */
  body?: string;
}

/** The kinds of Server-Sent Events the stream emits (used as the SSE event name). */
export type StreamEventType = 'step' | 'token' | 'artifact' | 'error' | 'ping';

/** A step begins — the client renders it with an active spinner. */
export interface StreamStepEvent {
  type: 'step';
  id: string;
  label: string;
}

/** A chunk of the current step's body (the "typed reveal"). */
export interface StreamTokenEvent {
  type: 'token';
  /** The step this text belongs to. */
  stepId: string;
  text: string;
}

/** Terminal success — carries the full generated artifact. */
export interface StreamArtifactEvent {
  type: 'artifact';
  result: unknown;
}

/** Terminal failure. `code` mirrors the server error code (e.g. `upgrade_required`). */
export interface StreamErrorEvent {
  type: 'error';
  message: string;
  code?: string;
}

/** Keep-alive heartbeat sent while the (possibly slow) model call is in flight. */
export interface StreamPingEvent {
  type: 'ping';
}

export type StreamEvent =
  | StreamStepEvent
  | StreamTokenEvent
  | StreamArtifactEvent
  | StreamErrorEvent
  | StreamPingEvent;

/** Human label for each stage, used in the intro/outro narration. */
const STAGE_TITLES: Record<StreamStageName, string> = {
  requirements: 'Requirement Document',
  'system-design': 'System Design',
  'database-design': 'Database Design',
  'api-design': 'API Design',
  review: 'Architect Review',
  'business-analysis': 'Business Analysis',
  'product-vision': 'Product Vision',
  roadmap: 'Implementation Roadmap',
  'threat-model': 'Threat Model',
  'qa-plan': 'Test Plan',
};

/**
 * Turn a finished artifact into an ordered list of narration steps.
 *
 * Deterministic and total: every branch returns a non-empty list, and unknown
 * shapes fall back to a generic "done" step, so the stream never stalls.
 */
export function buildNarration(
  stage: StreamStageName,
  artifact: unknown,
): NarrationStep[] {
  switch (stage) {
    case 'requirements':
      return requirementsNarration(artifact as RequirementDocument);
    case 'system-design':
      return systemDesignNarration(artifact as SystemDesign);
    case 'database-design':
      return databaseDesignNarration(artifact as DatabaseDesign);
    case 'api-design':
      return apiDesignNarration(artifact as ApiDesign);
    case 'review':
      return reviewNarration(artifact as ReviewReport);
    case 'business-analysis':
      return businessAnalysisNarration(artifact as BusinessAnalysis);
    case 'product-vision':
      return productVisionNarration(artifact as ProductVision);
    case 'roadmap':
      return roadmapNarration(artifact as ProjectRoadmap);
    case 'threat-model':
      return threatModelNarration(artifact as ThreatModel);
    case 'qa-plan':
      return qaPlanNarration(artifact as QaPlan);
    default:
      return [doneStep(stage)];
  }
}

function requirementsNarration(doc: RequirementDocument): NarrationStep[] {
  const functional = doc?.functional ?? [];
  const nonFunctional = doc?.nonFunctional ?? [];
  const roles = doc?.roles ?? [];
  const rules = doc?.businessRules ?? [];
  const steps: NarrationStep[] = [];

  if (roles.length) {
    steps.push({
      id: 'roles',
      label: `Identified ${count(roles.length, 'user role')}`,
      body: roles.map((r) => `• ${r.name} — ${r.description}`).join('\n'),
    });
  }
  steps.push({
    id: 'functional',
    label: `Deriving ${count(functional.length, 'functional requirement')}`,
    body: functional
      .map((f) => `${f.id}  [${f.priority}]  ${f.title}`)
      .join('\n'),
  });
  steps.push({
    id: 'non-functional',
    label: `Writing ${count(nonFunctional.length, 'non-functional requirement')}`,
    body: nonFunctional.map((n) => `${n.id}  (${n.category})  ${n.description}`).join('\n'),
  });
  if (rules.length) {
    steps.push({
      id: 'rules',
      label: `Capturing ${count(rules.length, 'business rule')}`,
      body: rules.map((r) => `${r.id}  ${r.description}`).join('\n'),
    });
  }
  steps.push(
    doneStep('requirements', `${functional.length} FRs · ${nonFunctional.length} NFRs · ${roles.length} roles`),
  );
  return steps;
}

function systemDesignNarration(design: SystemDesign): NarrationStep[] {
  const tech = design?.techStack ?? [];
  const services = design?.services ?? [];
  const arch = (design?.architecture ?? 'modular_monolith').replace(/_/g, ' ');
  return [
    {
      id: 'architecture',
      label: `Choosing an architecture: ${arch}`,
      body: design?.architectureRationale ?? '',
    },
    {
      id: 'tech',
      label: `Selecting the tech stack (${tech.length})`,
      body: tech.map((t) => `${t.layer.padEnd(10)} → ${t.technology}`).join('\n'),
    },
    {
      id: 'services',
      label: `Decomposing into ${count(services.length, 'service')}`,
      body: services
        .map(
          (s) =>
            `▸ ${s.name}${s.dependencies?.length ? ` (depends on ${s.dependencies.join(', ')})` : ''}\n    ${s.responsibility}`,
        )
        .join('\n'),
    },
    doneStep('system-design', `${arch} · ${services.length} services`),
  ];
}

function databaseDesignNarration(design: DatabaseDesign): NarrationStep[] {
  const entities = design?.entities ?? [];
  const relations = design?.relations ?? [];
  const columnCount = entities.reduce((n, e) => n + (e.columns?.length ?? 0), 0);
  return [
    {
      id: 'entities',
      label: `Modelling ${count(entities.length, 'entity', 'entities')} (${columnCount} columns)`,
      body: entities
        .map((e) => {
          const pk = e.columns?.find((c) => c.primaryKey);
          const fks = e.columns?.filter((c) => c.references).length ?? 0;
          const parts = [`${e.columns?.length ?? 0} cols`];
          if (pk) parts.push(`pk: ${pk.name}`);
          if (fks) parts.push(`${fks} fk`);
          return `▸ ${e.name}  (${parts.join(', ')})`;
        })
        .join('\n'),
    },
    {
      id: 'relations',
      label: `Wiring ${count(relations.length, 'relation')}`,
      body: relations.map((r) => `${r.from} ──${r.type}──▶ ${r.to}`).join('\n'),
    },
    doneStep(
      'database-design',
      `${design?.databaseType ?? 'PostgreSQL'} · ${entities.length} tables · ${relations.length} relations`,
    ),
  ];
}

function apiDesignNarration(design: ApiDesign): NarrationStep[] {
  const modules = design?.modules ?? [];
  const endpointCount = modules.reduce((n, m) => n + (m.endpoints?.length ?? 0), 0);
  const steps: NarrationStep[] = [
    {
      id: 'modules',
      label: `Grouping into ${count(modules.length, 'API module')}`,
      body: modules
        .map((m) => `▸ ${m.name.padEnd(14)} ${m.basePath}  (${m.endpoints?.length ?? 0} endpoints)`)
        .join('\n'),
    },
  ];
  // A compact endpoint listing across all modules gives the "routes appearing" feel.
  const endpoints = modules
    .flatMap((m) => (m.endpoints ?? []).map((e) => `${e.method.padEnd(6)} ${e.path}`))
    .join('\n');
  steps.push({
    id: 'endpoints',
    label: `Defining ${count(endpointCount, 'endpoint')}`,
    body: endpoints,
  });
  steps.push(doneStep('api-design', `${modules.length} modules · ${endpointCount} endpoints`));
  return steps;
}

function reviewNarration(report: ReviewReport): NarrationStep[] {
  const findings = [
    ...(report?.securityIssues ?? []),
    ...(report?.scalabilityIssues ?? []),
    ...(report?.performanceRisks ?? []),
    ...(report?.costOptimizations ?? []),
  ];
  const scores = report?.scores;
  return [
    {
      id: 'scoring',
      label: 'Scoring the design across four dimensions',
      body: scores
        ? [
            `Security     ${bar(scores.security)}  ${scores.security}`,
            `Scalability  ${bar(scores.scalability)}  ${scores.scalability}`,
            `Performance  ${bar(scores.performance)}  ${scores.performance}`,
            `Cost         ${bar(scores.cost)}  ${scores.cost}`,
          ].join('\n')
        : '',
    },
    {
      id: 'findings',
      label: `Flagging ${count(findings.length, 'finding')}`,
      body: findings
        .map((f) => `[${f.severity.toUpperCase()}] ${f.title}`)
        .join('\n'),
    },
    {
      id: 'recommendations',
      label: `Recommendations (${(report?.recommendations ?? []).length})`,
      body: (report?.recommendations ?? []).map((r) => `• ${r}`).join('\n'),
    },
    doneStep('review', `Overall score ${report?.overallScore ?? 0}/100`),
  ];
}

/*
 * The standalone stages.
 *
 * Every one of these reads its arrays defensively (`?? []`) for the same reason
 * the pipeline builders do: the narration runs on whatever `generate()`
 * returned, including a row written before a normalizer existed, and a stream
 * that throws mid-narration leaves the user watching a spinner forever.
 */

function businessAnalysisNarration(analysis: BusinessAnalysis): NarrationStep[] {
  const segments = analysis?.segments ?? [];
  const competitors = analysis?.competitors ?? [];
  const checklist = analysis?.researchChecklist ?? [];
  const steps: NarrationStep[] = [
    {
      id: 'problem',
      label: 'Stating the problem',
      body: analysis?.problem?.problem ?? '',
    },
    {
      id: 'segments',
      label: `Identifying ${count(segments.length, 'user segment')}`,
      body: segments.map((s) => `▸ ${s.name} — ${s.description ?? ''}`).join('\n'),
    },
  ];
  if (competitors.length) {
    steps.push({
      id: 'competitors',
      label: `Recalling ${count(competitors.length, 'comparable product')}`,
      body: competitors.map((c) => `▸ ${c.name}`).join('\n'),
    });
  }
  steps.push({
    id: 'usp',
    label: 'Framing the differentiator',
    body: analysis?.usp?.statement ?? '',
  });
  // The checklist is narrated last and always, because it is the counterweight
  // that makes the rest of this artifact honest — the sections above are the
  // model's unverified recollection, and this is where the document says so.
  steps.push({
    id: 'research',
    label: `Flagging ${count(checklist.length, 'claim')} to verify`,
    body: checklist.map((c) => `• ${c}`).join('\n'),
  });
  steps.push(
    doneStep(
      'business-analysis',
      `Verdict: ${(analysis?.verdict ?? 'unknown').replace(/-/g, ' ')}`,
    ),
  );
  return steps;
}

function productVisionNarration(vision: ProductVision): NarrationStep[] {
  const goals = vision?.goals ?? [];
  const mvp = vision?.mvp ?? [];
  const personas = vision?.personas ?? [];
  const metrics = vision?.successMetrics ?? [];
  return [
    { id: 'vision', label: 'Writing the north-star statement', body: vision?.vision ?? '' },
    {
      id: 'personas',
      label: `Profiling ${count(personas.length, 'persona')}`,
      body: personas.map((p) => `▸ ${p.name} — ${p.description ?? ''}`).join('\n'),
    },
    {
      id: 'goals',
      label: `Setting ${count(goals.length, 'strategic goal')}`,
      body: goals.map((g) => `• ${g}`).join('\n'),
    },
    {
      id: 'mvp',
      label: `Cutting the MVP to ${count(mvp.length, 'must-have')}`,
      body: mvp.map((m) => `• ${m}`).join('\n'),
    },
    {
      id: 'metrics',
      label: `Defining ${count(metrics.length, 'success metric')}`,
      body: metrics.map((m) => `▸ ${m.name} — ${m.target}`).join('\n'),
    },
    doneStep('product-vision', `${goals.length} goals · ${mvp.length} MVP items`),
  ];
}

function roadmapNarration(roadmap: ProjectRoadmap): NarrationStep[] {
  const phases = roadmap?.phases ?? [];
  const steps: NarrationStep[] = [
    { id: 'approach', label: 'Sequencing the delivery', body: roadmap?.summary ?? '' },
    {
      id: 'phases',
      label: `Planning ${count(phases.length, 'phase')}`,
      body: phases
        .map((p, i) => {
          // The week range comes from the effort estimate, never the model, so it
          // is only shown when that estimate existed — the same rule the view
          // follows when it falls back to the legacy `effort` string.
          const weeks =
            p.weeksMin !== undefined && p.weeksMax !== undefined
              ? `  (${p.weeksMin}–${p.weeksMax} wks)`
              : p.effort
                ? `  (${p.effort})`
                : '';
          return `${i + 1}. ${p.name}${weeks}${p.isMvp ? '  ← MVP' : ''}\n    ${p.goal ?? ''}`;
        })
        .join('\n'),
    },
  ];
  const milestones = phases.flatMap((p) => p.milestones ?? []);
  steps.push({
    id: 'milestones',
    label: `Breaking out ${count(milestones.length, 'milestone')}`,
    body: milestones.map((m) => `▸ ${m.title}  (${(m.tasks ?? []).length} tasks)`).join('\n'),
  });
  steps.push(
    doneStep('roadmap', `${phases.length} phases · ${roadmap?.totalEstimate ?? ''}`.trim()),
  );
  return steps;
}

function threatModelNarration(model: ThreatModel): NarrationStep[] {
  const threats = model?.threats ?? [];
  const boundaries = model?.trustBoundaries ?? [];
  const bySeverity = (severity: string) =>
    threats.filter((t) => t.severity === severity).length;
  return [
    {
      id: 'boundaries',
      label: `Mapping ${count(boundaries.length, 'trust boundary', 'trust boundaries')}`,
      body: boundaries.map((b) => `▸ ${b}`).join('\n'),
    },
    {
      id: 'threats',
      label: `Enumerating ${count(threats.length, 'threat')} across STRIDE`,
      body: threats
        .map(
          (t) =>
            `[${t.severity.toUpperCase()}] ${t.category.replace(/_/g, ' ')} — ${t.component}\n    ${t.threat}`,
        )
        .join('\n'),
    },
    {
      id: 'mitigations',
      label: 'Proposing a control for each',
      body: threats.map((t) => `▸ ${t.component}: ${t.mitigation}`).join('\n'),
    },
    doneStep(
      'threat-model',
      `${threats.length} threats · ${bySeverity('critical') + bySeverity('high')} high/critical`,
    ),
  ];
}

function qaPlanNarration(plan: QaPlan): NarrationStep[] {
  const suites = plan?.suites ?? [];
  const cases = suites.reduce((n, s) => n + (s.cases?.length ?? 0), 0);
  const tooling = plan?.tooling ?? [];
  return [
    { id: 'strategy', label: 'Choosing a testing strategy', body: plan?.summary ?? '' },
    {
      id: 'suites',
      label: `Building ${count(suites.length, 'test suite')}`,
      body: suites
        .map((s) => `▸ ${s.name.padEnd(24)} ${s.type.padEnd(12)} (${(s.cases ?? []).length} cases)`)
        .join('\n'),
    },
    {
      id: 'cases',
      label: `Writing ${count(cases, 'test case')}`,
      body: suites
        .flatMap((s) => (s.cases ?? []).map((c) => `${c.id.padEnd(8)} [${c.priority}]  ${c.title}`))
        .join('\n'),
    },
    {
      id: 'tooling',
      label: `Recommending ${count(tooling.length, 'tool')}`,
      body: tooling.map((t) => `• ${t}`).join('\n'),
    },
    doneStep('qa-plan', `${suites.length} suites · ${cases} cases`),
  ];
}

/** The final "done" step shown at the end of every stage. */
function doneStep(stage: StreamStageName, detail?: string): NarrationStep {
  const title = STAGE_TITLES[stage] ?? stage;
  return {
    id: 'done',
    label: `${title} ready`,
    body: detail,
  };
}

/** A tiny sparkline-style bar for the review scores (0–100 → 10 cells). */
function bar(score: number): string {
  const filled = Math.max(0, Math.min(10, Math.round((score / 100) * 10)));
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

/** "1 role" / "3 roles" — pluralize a noun by count. */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
