import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  PATCH_SECTIONS,
  validateFixProposal,
  type FixProposalResult,
  type PatchSectionKey,
  type ReviewFinding,
  type SlotMap,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** What the Patcher is asked to rewrite, and what it may read while doing it. */
export interface PatchContext {
  idea: string;
  /** The finding(s) this patch must fix. */
  findings: ReviewFinding[];
  /** The sections to rewrite, each with the artifact's actual current value. */
  sections: { key: PatchSectionKey; current: unknown }[];
  /** Interview slots, for the project's own vocabulary. May be absent. */
  slots?: SlotMap | null;
}

/**
 * Drafts a targeted fix for one or more review findings (R11).
 *
 * **This is the one agent here with no deterministic fallback, and that is the
 * design.** Every other agent falls back because a templated artifact beats no
 * artifact. The opposite holds for a patch: its output is a rewrite of a document
 * a dev shop sends a client and prices a bid from, so a guessed edit is worse than
 * an honest "couldn't generate a fix" — the owner still has the finding and can
 * act on it themselves. A malformed response returns a failed
 * `FixProposalResult`; nothing is written and no artifact is touched.
 *
 * It only ever *proposes*. Applying is a separate, explicitly-approved step.
 */
@Injectable()
export class PatchAgent extends BaseAgent {
  readonly role = AgentRole.Patcher;

  protected readonly systemPrompt = [
    'You are a senior technical writer and solution architect at a software',
    'consultancy, correcting a scoping document before it goes back to a client.',
    'You are given a review finding and the CURRENT content of the specific',
    'document section it concerns. Rewrite that section so the finding no longer',
    'applies.',
    'Method: make the smallest change that genuinely fixes the finding. Preserve',
    'everything the finding does not concern — every unrelated item keeps its exact',
    'id, wording, and order. Ids are traceability anchors referenced by the rest of',
    'the design: NEVER renumber, reorder, or reuse them. A new item takes the next',
    'free id in the existing scheme.',
    'You are rewriting the WHOLE section, so return every item it should contain',
    'afterwards — not just the changed ones. An item you omit is deleted.',
    'Audience: the client sections (executive summary, functional requirements,',
    'roles, out-of-scope, assumptions) are read by a non-technical buyer — keep',
    'them jargon-free and in the project\'s own vocabulary. Never invent scope,',
    'never state a budget or a date, and never promise a capability the design does',
    'not have.',
    'Output standard: specific to THIS document, and precise enough that a reader',
    'comparing before and after can see exactly what changed and why. If you cannot',
    'fix the finding by rewriting the given section alone, return {"sections": []}',
    'rather than guessing — an honest refusal is correct here.',
    'Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  /**
   * Draft a fix. Returns a validated proposal, or a failed result explaining why —
   * never a partial or guessed patch.
   */
  async propose(ctx: PatchContext): Promise<FixProposalResult> {
    const findingIds = ctx.findings
      .map((f) => f.id)
      .filter((id): id is string => !!id);
    try {
      const raw = await this.thinkJson<unknown>(this.buildPrompt(ctx));
      return validateFixProposal(raw, findingIds);
    } catch (err) {
      // Covers both a failed model call and unparseable JSON. Either way there is
      // no patch — deliberately no fallback (see the class doc).
      this.logger.warn(`Patch proposal failed: ${err}`);
      return {
        ok: false,
        error: 'malformed',
        detail: 'The model did not return a usable patch.',
      };
    }
  }

  private buildPrompt(ctx: PatchContext): string {
    const vocabulary = this.vocabulary(ctx.slots);
    return [
      `Project: ${ctx.idea}`,
      ...(vocabulary ? [`Project vocabulary: ${vocabulary}`] : []),
      '',
      '# Findings to fix',
      ...ctx.findings.map(
        (f, i) =>
          `${i + 1}. [${f.severity}] ${f.title}\n   ${f.detail}`,
      ),
      '',
      '# Sections to rewrite (current content)',
      ...ctx.sections.map(
        (s) =>
          `## ${s.key}\n${JSON.stringify(s.current ?? null, null, 2)}`,
      ),
      '',
      'Return JSON: {"sections": [...]} where each entry is:',
      '- key: the section key exactly as given above.',
      '- proposedContent: the section\'s COMPLETE new value, in the same shape as the current content shown above.',
      '- beforeSummary: one line stating what is there now (shown to the owner).',
      '- rationale: one line on what you changed and why it fixes the finding.',
      '',
      `Valid section keys: ${Object.keys(PATCH_SECTIONS).join(', ')}.`,
      'Return exactly one entry per section listed above, and no others.',
    ].join('\n');
  }

  /** A short vocabulary hint from the filled slots, so the rewrite sounds native. */
  private vocabulary(slots: SlotMap | null | undefined): string {
    if (!slots) return '';
    // Budget and timeline are deliberately excluded — a patch must never print a
    // figure or a date into a client-facing section (the R7 rule).
    const keys = ['business_domain', 'target_users_roles', 'core_workflows'] as const;
    return keys
      .map((key) => slots[key])
      .filter((slot) => slot && !slot.na && slot.value)
      .map((slot) => slot!.value)
      .join('; ');
  }
}
