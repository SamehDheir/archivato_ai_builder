import { Inject, Injectable } from '@nestjs/common';
import {
  AgentRole,
  buildDecisionExplanation,
  type DecisionAlternative,
  type DecisionExplanation,
  type DecisionRef,
  type SystemDesign,
  untrustedField,
} from '@archivato/shared';
import { BaseAgent } from '../agent.base';
import { LLM_PROVIDER, type LlmProvider } from '../llm-provider.interface';

/** What the explainer needs: the design + the pointed-at decision + a little context. */
export interface ExplainContext {
  idea: string;
  design: SystemDesign;
  ref: DecisionRef;
}

/**
 * Explains a single architecture decision on demand — the "Explain this
 * decision" button on the System Design. LLM-driven with a deterministic,
 * knowledge-based fallback (`buildDecisionExplanation` in `@archivato/shared`),
 * so it always returns a coherent rationale offline and in tests. The result is
 * ephemeral (never persisted).
 */
@Injectable()
export class ArchitectExplainerAgent extends BaseAgent {
  readonly role = AgentRole.ArchitectExplainer;

  protected readonly systemPrompt = [
    'You are a Principal Software Architect explaining ONE design decision to your',
    'team in a review. Be concrete and honest: give the real rationale, the',
    'tradeoffs actually accepted, credible alternatives (and the specific reason',
    'each was not chosen), and the risks worth watching. No marketing language, no',
    'hedging, no restating the obvious.',
    'Output standard: ground every point in THIS project’s design and context;',
    'each item is one clear sentence a senior engineer would find accurate and',
    'non-trivial. Return ONLY strict JSON matching the schema.',
  ].join(' ');

  constructor(@Inject(LLM_PROVIDER) llm: LlmProvider) {
    super(llm);
  }

  async explain(ctx: ExplainContext): Promise<DecisionExplanation> {
    const fallback = buildDecisionExplanation(ctx.design, ctx.ref);
    try {
      const raw = await this.thinkJson<Partial<DecisionExplanation>>(
        this.buildPrompt(ctx, fallback),
      );
      if (this.isValid(raw)) {
        return this.normalize(raw, fallback);
      }
      this.logger.debug('Explanation malformed; using deterministic build.');
    } catch (err) {
      this.logger.warn(`Explain-decision failed; using fallback: ${err}`);
    }
    return fallback;
  }

  private buildPrompt(ctx: ExplainContext, fallback: DecisionExplanation): string {
    const { design, ref } = ctx;
    const stack = design.techStack
      .map((t) => `${t.layer}: ${t.technology}`)
      .join(', ');
    const services = design.services
      .map((s) => `${s.name}${s.dependencies.length ? ` → ${s.dependencies.join('/')}` : ''}`)
      .join('; ');

    return [
      untrustedField('Idea', ctx.idea),
      `Architecture: ${design.architecture}`,
      `Tech stack: ${stack || '(none)'}`,
      `Services: ${services || '(none)'}`,
      '',
      `Explain this decision — kind: ${ref.kind}, subject: "${fallback.subject}"`,
      ref.kind === 'tech' ? `(the ${ref.key} layer)` : '',
      '',
      'Return JSON: { title, rationale, tradeoffs[] (strings), alternatives[] ' +
        '{ name, note }, risks[] (strings) }. 2–5 items per array, one sentence each.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private isValid(value: Partial<DecisionExplanation> | null): boolean {
    return (
      !!value &&
      typeof value.rationale === 'string' &&
      value.rationale.trim().length > 0
    );
  }

  /** Backfill anything the model omitted from the deterministic fallback. */
  private normalize(
    raw: Partial<DecisionExplanation>,
    fallback: DecisionExplanation,
  ): DecisionExplanation {
    const strings = (v: unknown, def: string[]): string[] =>
      Array.isArray(v) && v.length
        ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        : def;
    const alts = (v: unknown): DecisionAlternative[] =>
      Array.isArray(v) && v.length
        ? v
            .filter(
              (a): a is DecisionAlternative =>
                !!a && typeof a.name === 'string' && typeof a.note === 'string',
            )
            .map((a) => ({ name: a.name, note: a.note }))
        : fallback.alternatives;

    return {
      kind: fallback.kind,
      key: fallback.key,
      subject: fallback.subject,
      title: raw.title?.trim() || fallback.title,
      rationale: raw.rationale?.trim() || fallback.rationale,
      tradeoffs: strings(raw.tradeoffs, fallback.tradeoffs),
      alternatives: alts(raw.alternatives),
      risks: strings(raw.risks, fallback.risks),
    };
  }
}
