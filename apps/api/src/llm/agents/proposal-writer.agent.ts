import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AgentRole,
  buildFallbackProposal,
  HONESTY_RULES,
  isOverLength,
  proposalCharCount,
  PROPOSAL_CEILINGS,
  type ProposalChannel,
  type ProposalInput,
  type ProposalLocale,
  type ProposalSource,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

export interface ProposalResult {
  message: string;
  source: ProposalSource;
}

/** How each channel is read, so the model can pitch the register correctly. */
const CHANNEL_BRIEF: Record<ProposalChannel, string> = {
  upwork:
    'An Upwork cover letter. The client skims the first two lines in a list of a dozen bids, then decides whether to expand it. Direct, specific, no preamble.',
  mostaql:
    'A Mostaql (مستقل) bid. The tightest format here — the client reads it in a feed alongside many others, and length works against you.',
  email:
    'A direct email body (no subject line — the owner writes that). There is a little more room, so one extra line of substance is welcome; filler is not.',
  generic:
    'A general-purpose message the owner will paste wherever the client is. Assume it is read on a phone.',
};

const LOCALE_BRIEF: Record<ProposalLocale, string> = {
  en: 'Write in English. Plain, professional, first person.',
  ar:
    'اكتب بالعربية: فصحى مبسطة، دافئة ومهنية — ليست عامية، وليست فصحى متقشّفة أو رسمية كخطاب حكومي. استخدم الأرقام اللاتينية (8، 12) لا العربية-الهندية.',
};

/**
 * A different opening instruction per regenerate, so "Regenerate" produces a
 * genuinely different message rather than a re-roll of the same one. Rotated by
 * `variant`, which the client increments — cheaper and more reliable than sending
 * the previous draft back and asking for "something else".
 */
const ANGLES: readonly string[] = [
  'Open on the client’s problem, in the vocabulary of their own industry.',
  'Open on what their users will be able to do the day the first release ships.',
  'Open on the one decision in this project that most changes the price or the timeline.',
];

/**
 * Writes the covering message that carries the scoping link into a bid (R13).
 *
 * Two things make this agent different from the rest of the pipeline:
 *
 * 1. **Its output is signed by the user, not by us.** Every other agent produces
 *    an artifact the owner reviews as a document; this one produces words the
 *    owner sends to a buyer under their own name. That is why `HONESTY_RULES`
 *    (shared, prompt-embedded, test-pinned) is absolute: an invented "12 years of
 *    experience" is not a bad artifact, it is a lie in someone's bid.
 * 2. **Length is a hard product constraint, not a preference.** So the ceiling is
 *    enforced in code, with one shorten retry — and never by truncation. A message
 *    cut at 900 characters ends mid-thought, and the owner asked for something
 *    ready to send; they may not re-read it.
 *
 * Like every agent here it has a deterministic fallback, so mock mode and a failed
 * model call still produce a sendable message.
 */
@Injectable()
export class ProposalWriterAgent extends BaseAgent {
  readonly role = AgentRole.ProposalWriter;

  private readonly logger = new Logger(ProposalWriterAgent.name);

  /**
   * Stable across every call (channel/locale specifics ride in the user prompt),
   * which is what lets the provider mark it for prompt caching.
   */
  protected readonly systemPrompt = [
    'You are the owner of a small software house, writing the short covering',
    'message that accompanies a bid you are submitting for a client project.',
    'Method: you have just finished scoping this project properly — requirements,',
    'architecture, cost and a roadmap. The message’s job is to prove that in a few',
    'lines, get the client to open the scoping link, and get a reply. Show you',
    'understood their problem, point at the scoping, state effort plainly, and end',
    'with ONE question worth answering.',
    'Honesty constraints — these are absolute:',
    ...HONESTY_RULES,
    'Output standard: ONE message, plain text only. No markdown, no headings, no',
    'bullet lists, no subject line, no placeholder brackets, no emoji. Short',
    'paragraphs separated by blank lines. Every statement traceable to the scoping',
    'facts you are given — if a fact is not below, it does not go in the message.',
    'Return ONLY strict JSON: {"message": "<the message>"}.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  /**
   * Draft the message. Falls back to the deterministic template when the model is
   * unavailable or returns nothing usable.
   */
  async write(input: ProposalInput): Promise<ProposalResult> {
    try {
      const first = await this.attempt(input);
      if (first) {
        if (!isOverLength(first, input.channel)) return { message: first, source: 'llm' };

        // One retry, with the real overshoot quoted at it. If that still doesn't
        // fit, keep the SHORTER of the two and let the caller flag it: the owner
        // has to trim it either way, and the shorter draft is less work.
        this.logger.debug(
          `Proposal over the ${input.channel} ceiling (${proposalCharCount(first)}/${
            PROPOSAL_CEILINGS[input.channel]
          }); retrying shorter.`,
        );
        const second = await this.attempt(input, first);
        const best =
          second && proposalCharCount(second) < proposalCharCount(first) ? second : first;
        return { message: best, source: 'llm' };
      }
      this.logger.debug('Proposal malformed; using the deterministic template.');
    } catch (err) {
      this.logger.warn(`Proposal failed; using fallback: ${err}`);
    }
    return { message: buildFallbackProposal(input), source: 'fallback' };
  }

  /** One model call. Returns null when the response carries no usable message. */
  private async attempt(
    input: ProposalInput,
    tooLong?: string,
  ): Promise<string | null> {
    const raw = await this.thinkJson<{ message?: unknown }>(
      this.buildPrompt(input, tooLong),
    );
    const message = typeof raw?.message === 'string' ? raw.message.trim() : '';
    return message.length > 0 ? message : null;
  }

  private buildPrompt(input: ProposalInput, tooLong?: string): string {
    const { facts } = input;
    const ceiling = PROPOSAL_CEILINGS[input.channel];

    const lines = [
      `Channel: ${input.channel} — ${CHANNEL_BRIEF[input.channel]}`,
      `Language: ${LOCALE_BRIEF[input.locale]}`,
      `Hard length ceiling: ${ceiling} characters, including spaces. Going over means the message cannot be sent.`,
      '',
      '--- Scoping facts (the ONLY material you may draw on) ---',
      `Project: ${facts.title}`,
      `The client's idea, in their words: ${facts.idea}`,
    ];

    if (input.clientName) lines.push(`Client: ${input.clientName}`);
    const sender = [input.senderName, input.companyName].filter(Boolean).join(', ');
    if (sender) lines.push(`Sender (sign off as this): ${sender}`);
    if (facts.executiveSummary) {
      lines.push(`What we understood: ${facts.executiveSummary}`);
    }
    if (facts.capabilities.length > 0) {
      lines.push(`Capabilities in scope: ${facts.capabilities.join('; ')}`);
    }
    if (facts.effortWeeksMin !== undefined && facts.effortWeeksMax !== undefined) {
      lines.push(
        `Estimated effort: ${facts.effortWeeksMin}–${facts.effortWeeksMax} person-weeks (state it as a range; do not sharpen it into a single figure).`,
      );
    }
    if (facts.mvpStatement) lines.push(`What the first release delivers: ${facts.mvpStatement}`);
    if (facts.timeline) lines.push(`Timeline the client stated: ${facts.timeline}`);
    lines.push(`Scoping link: ${facts.shareUrl}`);

    // Present ONLY when the owner opted in. There is no "includePrice: false" line
    // to disregard — a figure the prompt never carried cannot reach the message.
    if (input.price) {
      lines.push(
        `Price to state, EXACTLY as written here — do not reformat, convert, round, or add to it: ${input.price}`,
      );
    }
    if (input.customHook) {
      lines.push(`The owner's own opening note, to weave in naturally: ${input.customHook}`);
    }

    lines.push(
      '',
      '--- Structure ---',
      '1. A hook that references the client’s need in their own domain terms.',
      `2. What we understood — 1–2 lines${facts.executiveSummary ? ' drawn from the summary above' : ''}.`,
      `3. What they get: frame the link as the full scoping — requirements, architecture, cost & roadmap — and include the URL exactly: ${facts.shareUrl}`,
      '4. One line on effort/timeline.',
      input.price
        ? '5. One line stating the price exactly as given.'
        : '5. (No price line — none was provided, and you must not imply one.)',
      '6. Close with ONE question that invites a reply and opens a real conversation about scope, priority, or the deadline. Not "let me know if you have questions".',
      `7. Sign off${sender ? ` as ${sender}` : ' without inventing a name'}.`,
      '',
      pickAngle(input.variant),
    );

    if (tooLong) {
      const over = proposalCharCount(tooLong);
      lines.push(
        '',
        `Your previous draft was ${over} characters — ${over - ceiling} over the ${ceiling} ceiling.`,
        'Rewrite it SHORTER. Cut adjectives, background, and any sentence that does not',
        `carry a fact. Keep the link, the effort line, ${
          input.price ? 'the price line, ' : ''
        }and the closing question.`,
        'Do not cut it off mid-thought — write a complete, shorter message.',
      );
    }

    return lines.join('\n');
  }
}

/** The regenerate angle for this draft number (0 = the first draft). */
function pickAngle(variant: number): string {
  const i = Math.abs(Math.trunc(variant)) % ANGLES.length;
  return variant > 0
    ? `This is a REGENERATE — the owner wants a different take from the last draft. ${ANGLES[i]}`
    : ANGLES[0];
}
