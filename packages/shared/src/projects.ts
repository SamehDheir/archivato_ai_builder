/**
 * The dashboard's read model: a client scoping as a **deal**, not an experiment.
 *
 * `ProjectSummary` (interview.ts) answers "what is this session". This file adds
 * the two things the owner actually asks of the list — *how far along is it* and
 * *has the client seen it* — plus the pure functions that derive them. Runtime-
 * free, so the API projects it and the web renders it from the same rules.
 */

import type { InterviewStatus, ProjectSummary } from './interview';

/**
 * Which artifacts a session has produced. Deliberately booleans, not the
 * artifacts themselves: the dashboard lists every project at once and needs to
 * know *whether* a stage is done, never what it says.
 */
export interface ProjectArtifacts {
  requirements: boolean;
  systemDesign: boolean;
  databaseDesign: boolean;
  apiDesign: boolean;
  review: boolean;
}

/** A project as the dashboard sees it: the summary + pipeline + share state. */
export interface ProjectOverview extends ProjectSummary {
  artifacts: ProjectArtifacts;
  /** A public share link exists — i.e. this scoping was sent to the client. */
  shared: boolean;
  /**
   * When the client last opened the link, or null (never opened / never sent).
   *
   * Deliberately **not** folded into `ClientLinkState`: the button does exactly
   * the same thing whether or not the client has read the page (minting is
   * idempotent, so it copies either way). This is a separate fact the badge
   * renders, and collapsing it into the action's state would make a display
   * concern drive a behavioural enum.
   */
  lastViewedAt: string | null;
}

/** The pipeline steps a scoping moves through, in order. */
export const PROJECT_STEPS = [
  'interview',
  'requirements',
  'systemDesign',
  'databaseDesign',
  'apiDesign',
  'review',
] as const;

export type ProjectStep = (typeof PROJECT_STEPS)[number];

/** One step's state in the progress rail. */
export interface ProjectStepState {
  step: ProjectStep;
  done: boolean;
}

export interface ProjectProgress {
  steps: ProjectStepState[];
  /** How many steps are done, out of `PROJECT_STEPS.length`. */
  completed: number;
  total: number;
  /** 0..100, rounded — for a bar/label. */
  percent: number;
  /** The first unfinished step, or null when everything is generated. */
  nextStep: ProjectStep | null;
}

/**
 * Derive pipeline progress from **artifact existence** — never from a stored
 * "stage" column. The artifacts *are* the state: each stage 409s until its
 * upstream exists, and a version restore can rewind the design, so a counter
 * would drift out of sync with the truth on disk. `interview` is the one step
 * with no artifact of its own; a confirmed interview is what unlocks the rest.
 */
export function projectProgress(
  status: InterviewStatus,
  artifacts: ProjectArtifacts,
): ProjectProgress {
  const done: Record<ProjectStep, boolean> = {
    interview: status === 'confirmed',
    requirements: artifacts.requirements,
    systemDesign: artifacts.systemDesign,
    databaseDesign: artifacts.databaseDesign,
    apiDesign: artifacts.apiDesign,
    review: artifacts.review,
  };

  const steps = PROJECT_STEPS.map((step) => ({ step, done: done[step] }));
  const completed = steps.filter((s) => s.done).length;
  const total = PROJECT_STEPS.length;

  return {
    steps,
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    nextStep: steps.find((s) => !s.done)?.step ?? null,
  };
}

/**
 * The state of the "Copy client link" action on a card:
 *
 *   - `locked` — the design hasn't reached the database design, which is the
 *     floor the API mints against (`ShareService.readDesign`). There is nothing
 *     worth putting in front of a client yet, so the action is disabled rather
 *     than offering a link that would 409.
 *   - `ready`  — shareable, but never shared. The click mints the link.
 *   - `sent`   — a link already exists. Minting is idempotent, so the click still
 *     just copies; this state exists to *tell the owner the client already has
 *     it* ("Sent to client"), which is the whole reason the badge is there.
 */
export type ClientLinkState = 'locked' | 'ready' | 'sent';

export function clientLinkState(project: ProjectOverview): ClientLinkState {
  if (project.shared) return 'sent';
  return canShareProject(project.artifacts) ? 'ready' : 'locked';
}

/**
 * The share floor, in one place: a design is shareable once the **database
 * design** exists. That is exactly what the Free plan can generate — sharing is
 * free, so its gate has to sit at or below the free tier's ceiling, or the
 * button would be permanently unreachable for the users it exists to serve.
 * Mirrors the server's gate; the server remains the one that enforces it.
 */
export function canShareProject(artifacts: ProjectArtifacts): boolean {
  return artifacts.databaseDesign;
}
