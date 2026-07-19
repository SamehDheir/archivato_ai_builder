import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  SLOT_KEYS,
  untrusted,
  untrustedField,
  type InterviewExchange,
  type IntentAnalysis,
  type OpenQuestion,
  type SlotKey,
  type SlotMap,
  type SlotValue,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import {
  INTERVIEW_LLM_PROVIDER,
  type LlmProvider,
} from '../llm-provider.interface';
import {
  SLOT_CATALOG,
  domainFollowUps,
  NOTES_ENTRY_ID,
} from '../../interview/slots';

/** What the interviewer needs to choose the next question. */
export interface InterviewerContext {
  idea: string;
  intent: IntentAnalysis | null;
  history: InterviewExchange[];
  /** The slots filled so far (drives "what's left to ask"). */
  slots?: SlotMap;
  /** Language to ask in — `'ar'` makes the question + options Arabic. */
  language?: 'ar' | 'en';
}

/** A slot value as the model returns it (same shape as the persisted `SlotValue`). */
type SlotUpdate = SlotValue;

/** The interviewer's decision for one turn. */
export interface InterviewerDecision {
  /** True when enough has been gathered to design a strong system. */
  done: boolean;
  /** Estimated requirement coverage, 0..1 (drives the progress bar). */
  coverage: number;
  /** Suggested phase for the next question (free text; validated by caller). */
  phase?: string;
  /** The next question to ask; omitted when done. */
  question?: string;
  /** Optional tap-to-pick answer choices for a closed question. */
  options?: string[];
  /** Whether several options can be picked at once (checkboxes vs one choice). */
  multiple?: boolean;
  /**
   * Slot values extracted from the latest answer (and any it makes obvious). The
   * service merges these onto the session — a later explicit value beats an
   * earlier inferred one, never the reverse.
   */
  slots?: Partial<Record<SlotKey, SlotUpdate>>;
  /**
   * Gaps the owner couldn't answer — recorded so they can be forwarded to the
   * end client, instead of being re-asked.
   */
  openQuestions?: OpenQuestion[];
}

/**
 * Owns the ADAPTIVE interview (real-AI path) — now a **slot-filling scoping
 * session**, not a blind question generator. Each turn it (1) extracts slot
 * values from the latest answer, (2) records gaps the owner couldn't answer as
 * questions for their client, and (3) asks about the single most important slot
 * still missing — phrased in the project's own vocabulary. It signals `done` only
 * once every slot is filled, open-questioned, or judged not applicable.
 *
 * Uses INTERVIEW_LLM_PROVIDER so the interview can run on a real model (Groq)
 * while the rest of the pipeline stays on the default provider. There is no
 * fallback here: `InterviewService` reverts to the deterministic question plan
 * when this agent fails or returns something malformed (e.g. in mock mode) — in
 * which case no slots are extracted, which downstream code tolerates.
 */
@Injectable()
export class InterviewerAgent extends BaseAgent {
  readonly role = AgentRole.Interviewer;

  protected readonly systemPrompt = [
    'You are an expert software requirements interviewer — a business analyst at a',
    'software agency who runs a discovery call to SCOPE a client project. You fill a',
    'fixed checklist of scoping facts (a slot catalog), one sharp question at a time,',
    'tailored to THIS concept and phrased in the client\'s own vocabulary.',
    'Every turn you first extract any slot values the latest answer reveals — even',
    'implicitly — then ask about the single most important slot still missing.',
    'You never bundle two questions into one, never re-ask what was already answered,',
    'and never ask for something the concept already makes obvious.',
    'When the owner does not know an answer (they have not discussed it with their',
    'client yet), you do NOT push — you record it as a question to forward to the',
    'client, and move on.',
    'Keep the interview SHORT: at most 9 questions total, and fewer is better —',
    'stop as soon as every slot is filled, recorded as an open question, or judged',
    'not applicable to this project.',
    'For closed questions (scale, tech choice, budget, timeline, categories) offer a',
    'few short, mutually distinct tap-to-pick options; set multiple=true when several',
    'can genuinely apply. Omit options for open-ended questions like the goal or the',
    'core workflow.',
    'Output standard: the question must be concrete and unambiguous, the coverage',
    'estimate honest, the slot extractions faithful to what was actually said, and',
    'the JSON strictly valid. Always write the question and all options in the SAME',
    'language the user used for their idea and answers (an Arabic idea gets Arabic',
    'questions).',
  ].join(' ');

  constructor(@Inject(INTERVIEW_LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async decide(ctx: InterviewerContext): Promise<InterviewerDecision> {
    // Slightly creative so questions read naturally, but still JSON-constrained.
    return this.thinkJson<InterviewerDecision>(this.buildPrompt(ctx), {
      temperature: 0.4,
    });
  }

  private buildPrompt(ctx: InterviewerContext): string {
    const qa =
      ctx.history.length > 0
        ? ctx.history.map((h, i) => this.renderExchange(h, i)).join('\n')
        : '(no questions answered yet)';

    const arabic =
      ctx.language === 'ar'
        ? 'IMPORTANT: The user wrote in Arabic. Write "question", every string in ' +
          '"options", and every "questionForClient" ENTIRELY in Arabic (Modern ' +
          'Standard Arabic). Keep "phase" and all slot keys as the given English keys.'
        : '';

    const hints = domainFollowUps(ctx.intent?.domain);
    const domainBlock = hints.length
      ? [
          `High-value follow-ups for a ${ctx.intent?.domain} project — make sure these are covered:`,
          ...hints.map((h) => `  - ${h}`),
        ].join('\n')
      : '';

    return [
      arabic,
      untrustedField('Concept', ctx.idea),
      ctx.intent ? `Domain: ${ctx.intent.domain}` : '',
      ctx.intent && ctx.intent.openQuestions.length
        ? `Known open questions to resolve: ${ctx.intent.openQuestions.join('; ')}`
        : '',
      domainBlock,
      '',
      'Scoping checklist (the slots to fill):',
      this.renderCatalog(),
      '',
      'Slot state so far:',
      this.renderSlotState(ctx.slots ?? {}),
      '',
      'Conversation so far:',
      qa,
      '',
      'Do this, in order:',
      '1. EXTRACT: from the latest answer (and anything it makes obvious), fill any',
      '   slots you now know. Mark source "explicit" if the user stated it, "inferred"',
      '   if you read it between the lines; set confidence "high" or "low" honestly.',
      '2. OPEN QUESTIONS: if the latest answer shows the user does not know a value or',
      '   has not discussed it with their client, DO NOT re-ask it — add an',
      '   openQuestions entry with a clear question they can forward to their client,',
      '   and move on. A slot that is genuinely irrelevant to this project can instead',
      '   be returned in "slots" with na=true and a short naReason.',
      '3. ASK: choose the single most important slot that is still missing (neither',
      '   filled nor open-questioned nor na) and ask ONE question about it, using the',
      "   project's own vocabulary and domain terms — not generic wording.",
      '',
      'You may only set done=true once EVERY slot is filled, recorded as an open',
      'question, or marked na. In particular, budget_range and timeline MUST each be',
      'either filled or recorded as an open question before you finish (covered is not',
      'the same as answered — an open question counts as covered).',
      '',
      'Decide the single most valuable NEXT question and return JSON:',
      '- "done": boolean — true only when every slot is filled, open-questioned, or na.',
      '- "coverage": number 0..1 — your honest estimate of how complete the scoping now is.',
      '- "phase": one of ["understanding","business_logic","features","scale","technical","commercial"].',
      '- "question": string — the single next question (omit when done).',
      '- "options"?: array of up to 5 short, distinct answer choices (only for closed questions).',
      '- "multiple"?: boolean — true when more than one option can apply.',
      '- "slots"?: object mapping slotKey -> {value, confidence:"high"|"low", source:"explicit"|"inferred", na?:boolean, naReason?:string}.',
      '- "openQuestions"?: array of {slotKey, questionForClient}.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Render one transcript turn — call notes are labelled, not shown as a Q/A.
   *
   * The notes block was already quoted with `"""`, which is the right instinct;
   * it is now the shared fence instead, because `"""` is only a convention to the
   * model, carries no standing instruction, and is trivially closed by pasted
   * text that happens to contain it. Pasted call notes are the single largest
   * untrusted input in the product — a page of text from a source neither we nor
   * the owner wrote.
   */
  private renderExchange(h: InterviewExchange, i: number): string {
    if (h.question.id === NOTES_ENTRY_ID) {
      return `Call notes provided by the user:\n${untrusted(h.answer)}`;
    }
    return `${i + 1}. Q: ${h.question.prompt}\n   A: ${untrusted(h.answer)}`;
  }

  private renderCatalog(): string {
    return SLOT_KEYS.map(
      (key) => `  - ${key}: ${SLOT_CATALOG[key].description}`,
    ).join('\n');
  }

  private renderSlotState(slots: SlotMap): string {
    return SLOT_KEYS.map((key) => {
      const slot = slots[key];
      if (!slot) return `  - ${key}: (missing)`;
      if (slot.na) return `  - ${key}: n/a (${untrusted(slot.naReason ?? 'not applicable')})`;
      return `  - ${key}: ${untrusted(slot.value)} [${slot.source}/${slot.confidence}]`;
    }).join('\n');
  }
}
