import type {
  ArtifactLanguage,
  FixLogEntry,
  InterviewExchange,
  InterviewQuestion,
  InterviewStatus,
  IntentAnalysis,
  OpenQuestion,
  ProposalDraft,
  RequirementsSummary,
  ProjectIdeaInput,
  SlotMap,
} from '@archivato/shared';
import { detectArtifactLanguage } from '@archivato/shared';

/**
 * The persisted state of one interview session. Today this lives in memory;
 * the persistence slice maps it onto a Prisma model with the same shape.
 */
export interface InterviewSession {
  id: string;
  /** Owner (authenticated user id). Null only for legacy pre-ownership rows. */
  userId: string | null;
  input: ProjectIdeaInput;
  /** Optional user-set display name; falls back to the idea when null. */
  title: string | null;
  /**
   * The end client this scoping is for (optional). Deliberately a sibling of
   * `input`, not a field inside it: `input` is what the agents read, and the
   * client's name is a label for the owner's dashboard — it must never leak into
   * a prompt or onto the public share page.
   */
  clientName: string | null;
  /**
   * The owner's internal weekly rate (USD/person-week) for pricing this project
   * (R9). Owner-only — never crosses onto the public share page.
   */
  weeklyRate: number | null;
  status: InterviewStatus;
  intent: IntentAnalysis | null;
  /** Answered questions, in the order they were asked. */
  history: InterviewExchange[];
  /**
   * The question currently awaiting an answer (adaptive questions are generated,
   * so the pending one must be stored rather than recomputed). Null at the gate.
   */
  pendingQuestion: InterviewQuestion | null;
  /** Latest requirement-coverage estimate, 0..1 (drives the progress bar). */
  coverage: number;
  summary: RequirementsSummary | null;
  /**
   * The derived slot snapshot (R6) — a cache over `history`, never authoritative
   * over it. Null on legacy rows and pure plan-mode runs; consumers must tolerate
   * that (an absent snapshot reads as "no slots filled").
   */
  slots: SlotMap | null;
  /** Gaps to forward to the client, accumulated as the interview couldn't fill them. */
  openQuestions: OpenQuestion[] | null;
  /**
   * Append-only record of the review fixes the owner approved (R11). Null on rows
   * predating it, and on any project where no fix was ever applied.
   *
   * It lives on the session, not the review, because a re-run replaces the review
   * row (statuses reset — a re-run is a fresh assessment) and the review is carried
   * in version snapshots, so a restore would rewind a log stored there.
   */
  fixLog: FixLogEntry[] | null;
  /**
   * The last 5 proposal cover messages written for this project (R13), newest
   * first. Null until the owner writes one.
   *
   * **Owner-only** — this is the owner's outbox, not an artifact: it carries their
   * price, their sender name, and what they chose to tell the client, and it is
   * never projected onto the public share payload. It lives on the session for the
   * same reason as `fixLog`: version snapshots rewind design artifacts, and a
   * restore must not rewind messages the owner has already sent.
   */
  proposalDrafts: ProposalDraft[] | null;
  /**
   * Whether this project generates the threat model + QA plan (R12).
   *
   * **`null` = the owner hasn't decided**, so the budget-derived default applies —
   * read it through `resolveExtendedArtifacts(…, slots)`, never bare. That marker
   * is what lets the toggle at the gate keep tracking a corrected `budget_range`
   * until the owner touches it; once they do, this holds their choice and no slot
   * edit can overrule it. `confirm()` pins a value, so every confirmed project has
   * an explicit answer.
   *
   * Rows predating R12 were backfilled to `true`, so nothing already created
   * changed behaviour.
   */
  generateExtendedArtifacts: boolean | null;
  /**
   * The language this project's **generated prose** is written in.
   *
   * Not the viewer's UI locale, and not derivable from it: an artifact is
   * generated once and then read by people who have no toggle — the public share
   * page has neither a session nor an owner — so the language is a property of
   * the project.
   *
   * **`null` = the owner never chose**, which resolves to the language the client
   * described their business in. Read it through
   * `resolveArtifactLanguage(session)`, never bare — the derivation is the same
   * pattern as `generateExtendedArtifacts`, and for the same reason: it keeps
   * tracking an idea the owner is still editing, and stops the moment they state
   * a preference.
   */
  artifactLanguage: ArtifactLanguage | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The language this project's artifacts are generated in.
 *
 * The owner's explicit choice wins; absent one, the client's own words decide.
 * The idea is the right signal rather than the transcript: it is present from
 * the first moment (before any answer exists), it is what the owner typed to
 * describe the engagement, and it is stable — deriving from the running
 * transcript would let one English answer mid-interview flip the language of a
 * document whose earlier half was already generated in Arabic.
 */
export function resolveArtifactLanguage(
  session: Pick<InterviewSession, 'artifactLanguage' | 'input'>,
): ArtifactLanguage {
  return session.artifactLanguage ?? detectArtifactLanguage(session.input.idea);
}
