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
    prompt: 'In one or two sentences, what is the main goal of the system?',
  },
  {
    id: 'a2',
    phase: InterviewPhase.Understanding,
    prompt: 'Who will use the system? Pick the roles that apply.',
    options: ['Admin', 'Manager', 'Staff / Employee', 'Customer', 'Guest'],
    multiple: true,
  },
  // Phase B — Business Logic
  {
    id: 'b1',
    phase: InterviewPhase.BusinessLogic,
    prompt:
      'Walk me through the core workflow — how does the system work day to day?',
  },
  // Phase C — Features
  {
    id: 'c1',
    phase: InterviewPhase.Features,
    prompt: 'Does it handle payments or billing? Pick what applies.',
    options: [
      'Online payments',
      'Subscriptions / recurring billing',
      'Invoicing',
      'No payments',
    ],
    multiple: true,
  },
  {
    id: 'c2',
    phase: InterviewPhase.Features,
    prompt: 'Which notifications does it need?',
    options: ['Email', 'SMS', 'In-app', 'Push', 'None'],
    multiple: true,
  },
  // Phase D — Scale
  {
    id: 'd1',
    phase: InterviewPhase.Scale,
    prompt: 'How many users do you expect within the first year?',
    options: ['Under 100', '100 – 10,000', '10,000 – 1M', 'Over 1M'],
  },
  {
    id: 'd2',
    phase: InterviewPhase.Scale,
    prompt: 'What stage is this system?',
    options: ['MVP / prototype', 'Growing startup', 'Enterprise-grade'],
  },
  // Phase E — Technical Preferences
  {
    id: 'e1',
    phase: InterviewPhase.Technical,
    prompt: 'Any database preference?',
    options: ['SQL', 'NoSQL', 'No preference'],
  },
  {
    id: 'e2',
    phase: InterviewPhase.Technical,
    prompt: 'Any architecture preference?',
    options: ['Monolith', 'Microservices', 'No preference'],
  },
  // Phase F — Commercial (R6). Budget + timeline are new to the interview's
  // scope: a dev shop can't scope a bid without them. In pure PLAN mode these sit
  // past the 9-question hard cap (`MAX_ADAPTIVE_QUESTIONS`), so a fully offline
  // run won't reach them — that's an accepted degradation (plan mode fills no
  // slots either). The adaptive path is what guarantees they're covered: the
  // model must fill or open-question both before it may finish.
  {
    id: 'f1',
    phase: InterviewPhase.Commercial,
    prompt: 'What budget range does the client have in mind for the build?',
    options: [
      'Under $5k',
      '$5k – $20k',
      '$20k – $50k',
      'Over $50k',
      'Not discussed yet',
    ],
  },
  {
    id: 'f2',
    phase: InterviewPhase.Commercial,
    prompt: 'What timeline does the client need it delivered in?',
    options: [
      'ASAP / weeks',
      '1 – 3 months',
      '3 – 6 months',
      'Flexible',
      'Not discussed yet',
    ],
  },
];

export const TOTAL_QUESTIONS = QUESTION_PLAN.length;

export function getQuestionById(id: string): InterviewQuestion | undefined {
  return QUESTION_PLAN.find((q) => q.id === id);
}
