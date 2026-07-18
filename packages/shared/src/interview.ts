/**
 * The AI interview loop — the platform's critical feature. The system runs a
 * structured, phased interview (A–E) until requirement completeness crosses a
 * threshold, then summarizes and waits for explicit user confirmation before
 * any design work begins.
 */

/** The interview phases, in ask order. */
export enum InterviewPhase {
  /** A — main goal & users. */
  Understanding = 'understanding',
  /** B — how the system works, approvals. */
  BusinessLogic = 'business_logic',
  /** C — payments, notifications, reports. */
  Features = 'features',
  /** D — expected users, MVP vs enterprise. */
  Scale = 'scale',
  /** E — SQL/NoSQL, monolith/microservices. */
  Technical = 'technical',
  /**
   * F — the commercial frame a scoping needs: budget and timeline. New in the
   * client-scoping pivot (R6); the interview now closes the deal-shaping gaps a
   * dev shop has to fill, not just the technical ones.
   */
  Commercial = 'commercial',
}

export const INTERVIEW_PHASE_ORDER: readonly InterviewPhase[] = [
  InterviewPhase.Understanding,
  InterviewPhase.BusinessLogic,
  InterviewPhase.Features,
  InterviewPhase.Scale,
  InterviewPhase.Technical,
  InterviewPhase.Commercial,
] as const;

/** Requirement completeness required before the interview can be confirmed. */
export const COMPLETENESS_THRESHOLD = 0.9;

/**
 * Hard cap on interview questions — the adaptive loop never asks more than this
 * (the plan closes the completeness gate by here). Single source of truth for
 * the API's `MAX_ADAPTIVE_QUESTIONS` and the web's "Question N of up to M"
 * progress hint so a first-timer can see the interview is short.
 */
export const INTERVIEW_MAX_QUESTIONS = 9;

export type InterviewStatus =
  /** Still asking questions. */
  | 'collecting'
  /** Threshold reached; summary produced; waiting for user confirmation. */
  | 'awaiting_confirmation'
  /** User confirmed; requirements are locked and the pipeline may proceed. */
  | 'confirmed';

export interface InterviewQuestion {
  id: string;
  phase: InterviewPhase;
  prompt: string;
  /**
   * Optional preset choices the user can tap instead of typing. The client still
   * lets them add free-text detail; the submitted answer is the picks (joined)
   * plus any extra text.
   */
  options?: string[];
  /** When true the choices are multi-select (checkboxes); else single-select. */
  multiple?: boolean;
}

export interface InterviewExchange {
  question: InterviewQuestion;
  answer: string;
}

// ── Slot-filling model (R6) ──────────────────────────────────────────────────
//
// The interview is a **slot-filling scoping session**, not a blind question
// generator: a fixed catalog of the facts a dev shop needs to scope a client
// project, each of which the interviewer tries to fill from the conversation.
//
// The slot snapshot is a **derived cache** — the transcript (`history[]`) stays
// the single source of truth, and slots are always re-derivable from it. The
// catalog itself (descriptions + client-question templates) lives server-side in
// the interview module; only the value shapes and the key list are shared,
// because the web renders the filled slots at the confirmation gate.

/** The scoping facts the interview tries to fill. Stable order (rendering + prompts). */
export const SLOT_KEYS = [
  'business_domain',
  'target_users_roles',
  'target_market',
  'core_workflows',
  'data_entities',
  'integrations',
  'scale_expectations',
  'constraints',
  'budget_range',
  'timeline',
  'existing_assets',
] as const;

export type SlotKey = (typeof SLOT_KEYS)[number];

/** How sure we are of a slot value: stated outright vs read between the lines. */
export type SlotConfidence = 'high' | 'low';

/** Where a slot value came from — an explicit answer, or the model's inference. */
export type SlotSource = 'explicit' | 'inferred';

/**
 * A filled slot. `{ value, confidence, source }` is the persisted shape; the
 * optional `na*` fields mark a slot the model judged irrelevant for this domain
 * (so it neither nags for it nor treats it as an open question).
 */
export interface SlotValue {
  value: string;
  confidence: SlotConfidence;
  source: SlotSource;
  /** True when the model judged this slot not applicable to this project. */
  na?: boolean;
  /** Why it's not applicable (only meaningful with `na`). */
  naReason?: string;
}

/** The filled-slot snapshot. Absent keys are simply unfilled. */
export type SlotMap = Partial<Record<SlotKey, SlotValue>>;

/**
 * A gap the owner couldn't answer — recorded (never re-asked) so it can be
 * forwarded to the end client. `questionForClient` is a ready-to-send question.
 */
export interface OpenQuestion {
  /** The slot this question would fill (a `SlotKey`, kept as a string for JSON). */
  slotKey: string;
  questionForClient: string;
}

/** The Product Analyst's structured read of a raw idea (Intent Analysis stage). */
export interface IntentAnalysis {
  summary: string;
  domain: string;
  primaryUsers: string[];
  coreCapabilities: string[];
  openQuestions: string[];
}

/**
 * A lightweight requirements preview produced when the interview reaches the
 * confirmation gate. The full, formal Requirement Document is generated by the
 * Requirement Engineer in a later stage.
 */
export interface RequirementsSummary {
  goal: string;
  users: string[];
  features: string[];
  businessRules: string[];
  constraints: string[];
  assumptions: string[];
}

/**
 * A lightweight row for the "my projects" list — one per interview session the
 * signed-in user owns. The heavy artifacts are fetched on demand when opened.
 */
export interface ProjectSummary {
  sessionId: string;
  idea: string;
  /** Optional user-set display name; falls back to `idea` when absent. */
  title?: string;
  /**
   * The end client this scoping is for (optional, owner-set). A label for the
   * owner's own dashboard — it is **not** part of `idea`, so no design agent ever
   * reads it and it never crosses onto the public share page.
   *
   * One deliberate exception, and only via the owner's hand: the R13 proposal
   * composer prefills its "client name" field from this, because that message is
   * addressed *to* this person. It reaches the writer only as form input the owner
   * saw and can clear — the service never defaults to it silently.
   */
  clientName?: string;
  status: InterviewStatus;
  /** 0..1 requirement completeness (drives a small progress indicator). */
  completeness: number;
  /**
   * The owner's internal weekly rate (USD/person-week) for pricing this project
   * (R9). **Owner-only** — used to compute a suggested price on the authenticated
   * cost page; it is NEVER part of the public share payload.
   */
  weeklyRate?: number | null;
  /**
   * Whether this project generates the threat model + QA plan (R12). Optional for
   * back-compat with any cached/older payload; **absent reads as `true`**, which
   * is the pre-R12 behaviour (both stages always offered).
   */
  generateExtendedArtifacts?: boolean;
  /**
   * ISO timestamp of creation. The free plan allows N designs **per calendar
   * month**, so the client counts the projects created in the current period
   * (`countInQuotaPeriod`) — the project list stays the meter, with no usage table.
   * Optional for back-compat with any cached/older payload.
   */
  createdAt?: string;
  /** ISO timestamp of the last change, for "most recently worked on" ordering. */
  updatedAt: string;
}

/** The full interview state returned to clients. */
export interface InterviewState {
  sessionId: string;
  status: InterviewStatus;
  /** Current phase being asked about, or null once complete. */
  phase: InterviewPhase | null;
  /** 0..1 requirement completeness. */
  completeness: number;
  intent: IntentAnalysis | null;
  history: InterviewExchange[];
  /** The question awaiting an answer, or null at the gate / when confirmed. */
  currentQuestion: InterviewQuestion | null;
  /** Present once the gate is reached. */
  summary: RequirementsSummary | null;
  /**
   * The derived slot snapshot (R6). Always present (possibly empty — a pure
   * plan-mode/offline run fills no slots). The confirmation gate renders these,
   * marking inferred values so the owner can correct them.
   */
  slots: SlotMap;
  /** Gaps to forward to the end client (empty when there are none). */
  openQuestions: OpenQuestion[];
  /**
   * Whether this project will generate the threat model + QA plan (R12). Derived
   * from the stated budget at the gate, where it is rendered as a toggle the owner
   * can override before confirming. Optional for back-compat; absent reads as `true`.
   */
  generateExtendedArtifacts?: boolean;
}
