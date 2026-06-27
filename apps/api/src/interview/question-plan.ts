import { InterviewPhase, type InterviewQuestion } from '@archivato/shared';

/**
 * The structured interview script. Questions are asked in phase order; the loop
 * advances to the confirmation gate once enough are answered (see threshold).
 *
 * This deterministic plan is the reliable backbone of the "AI interview". When
 * running against a real LLM provider, adaptive follow-ups can be layered on top
 * in a later slice — but the demo and tests never depend on a live model.
 */
export const QUESTION_PLAN: readonly InterviewQuestion[] = [
  // Phase A — Understanding
  {
    id: 'a1',
    phase: InterviewPhase.Understanding,
    prompt: 'What is the main goal of the system?',
  },
  {
    id: 'a2',
    phase: InterviewPhase.Understanding,
    prompt: 'Who are the primary users and roles?',
  },
  // Phase B — Business Logic
  {
    id: 'b1',
    phase: InterviewPhase.BusinessLogic,
    prompt:
      'Walk me through the core workflow — how does the system work day to day?',
  },
  {
    id: 'b2',
    phase: InterviewPhase.BusinessLogic,
    prompt: 'Are there any approval steps or status transitions?',
  },
  // Phase C — Features
  {
    id: 'c1',
    phase: InterviewPhase.Features,
    prompt: 'Do you need payments or billing? If so, describe them.',
  },
  {
    id: 'c2',
    phase: InterviewPhase.Features,
    prompt: 'What notifications are required (email, SMS, in-app)?',
  },
  {
    id: 'c3',
    phase: InterviewPhase.Features,
    prompt: 'What reports or dashboards do users need?',
  },
  // Phase D — Scale
  {
    id: 'd1',
    phase: InterviewPhase.Scale,
    prompt: 'How many users do you expect now and in 12 months?',
  },
  {
    id: 'd2',
    phase: InterviewPhase.Scale,
    prompt: 'Is this an MVP or an enterprise-grade system?',
  },
  // Phase E — Technical Preferences
  {
    id: 'e1',
    phase: InterviewPhase.Technical,
    prompt: 'Do you prefer SQL or NoSQL — or no preference?',
  },
  {
    id: 'e2',
    phase: InterviewPhase.Technical,
    prompt: 'Monolith or microservices — or no preference?',
  },
];

export const TOTAL_QUESTIONS = QUESTION_PLAN.length;

export function getQuestionById(id: string): InterviewQuestion | undefined {
  return QUESTION_PLAN.find((q) => q.id === id);
}
