import {
  artifactLanguageOf,
  artifactTextDirection,
  buildConsistencyFindings,
  CODE_FACING_RULE,
  detectArtifactLanguage,
  extractionGapAssumption,
  normalizeBusinessAnalysis,
  OUTPUT_LANGUAGE_RULES,
  outputLanguageRules,
  stripMetrics,
  toArtifactLanguage,
  unsourcedRoleAssumption,
  withResearchChecklist,
  type ArtifactLanguage,
  type BusinessAnalysis,
} from '@archivato/shared';
import { AgentRole } from '@archivato/shared';
import { BaseAgent } from './agent.base';
import type {
  LlmCompleteOptions,
  LlmMessage,
  LlmProvider,
} from './llm-provider.interface';
import {
  lazyArtifactLanguage,
  runWithLlmContext,
} from './usage/llm-usage.context';

/**
 * The output-language system.
 *
 * The bug this covers was **silent**: only two of fifteen agents were ever told
 * what language to write in, so the other thirteen received an Arabic transcript
 * with no instruction and picked a language per field. One real run produced an
 * Arabic competitor name and an English architecture rationale from the same
 * pipeline. Nothing threw; every stage was confidently inconsistent.
 *
 * So the tests here assert on the two things that actually decide the outcome:
 * what reaches the **provider** as a system prompt, and what the deterministic
 * code composes when no model is involved at all.
 */

/** Captures the options an agent hands the provider. */
class SpyProvider implements LlmProvider {
  readonly name = 'spy';
  readonly defaultModel = 'spy-1';
  readonly calls: LlmCompleteOptions[] = [];

  async complete(_m: LlmMessage[], options?: LlmCompleteOptions): Promise<string> {
    this.calls.push(options ?? {});
    return '{}';
  }

  async completeJson<T>(
    _m: LlmMessage[],
    options?: LlmCompleteOptions,
  ): Promise<T> {
    this.calls.push(options ?? {});
    return {} as T;
  }
}

class ProbeAgent extends BaseAgent {
  readonly role = AgentRole.RequirementEngineer;
  protected readonly systemPrompt = 'You are a probe.';

  ask(): Promise<unknown> {
    return this.thinkJson('hello');
  }
}

/** Run `fn` as if an HTTP request for a project in `language` had established it. */
function inLanguage<T>(language: ArtifactLanguage, fn: () => Promise<T>): Promise<T> {
  return runWithLlmContext(
    {
      userId: 'u1',
      sessionId: 's1',
      stage: 'requirements',
      resolveLanguage: lazyArtifactLanguage(async () => language),
    },
    fn,
  );
}

describe('the language instruction reaches every agent', () => {
  it('appends the output-language rule to the system prompt', async () => {
    const llm = new SpyProvider();
    const agent = new ProbeAgent(llm);

    await inLanguage('ar', () => agent.ask());

    const system = llm.calls[0].system ?? '';
    expect(system).toContain('You are a probe.');
    expect(system).toContain(outputLanguageRules('ar'));
  });

  it('applies it in BaseAgent, so a NEW agent is localized before it is written', async () => {
    // The point of the chokepoint: `ProbeAgent` says nothing about language and
    // is still instructed. A rule fifteen agents state by hand is a rule the
    // sixteenth forgets — the `UNTRUSTED_INPUT_RULES` precedent.
    const llm = new SpyProvider();
    await inLanguage('ar', () => new ProbeAgent(llm).ask());

    expect(llm.calls[0].system).toMatch(/Arabic/);
  });

  it('pins Modern Standard Arabic, not whatever register the input used', async () => {
    // A model mirrors its input, and an interview conducted in Levantine produced
    // a client-facing document in Levantine. MSA is the one variety that reads as
    // professional in Riyadh, Cairo, Beirut and Casablanca alike.
    const rules = outputLanguageRules('ar');
    expect(rules).toContain('الفصحى');
    expect(rules).toMatch(/Never use a regional spoken dialect/i);
  });

  it('carves out code-facing identifiers in EVERY language', async () => {
    // The one behaviour that was already correct and must not regress: a schema
    // is code, so `books` and `borrower_id` stay English while the chrome around
    // them is translated. Without this a model returns a table named الكتب and
    // the generated SQL, Prisma schema and scaffold stop compiling.
    for (const language of ['en', 'ar'] as const) {
      expect(outputLanguageRules(language)).toContain(CODE_FACING_RULE);
    }
    expect(OUTPUT_LANGUAGE_RULES.ar.join(' ')).toMatch(/JSON key/i);
  });

  it('caches per language, so prompt caching still works in both', async () => {
    // `ClaudeLlmProvider` marks the system prompt with `cache_control`; a prompt
    // rebuilt per call would defeat that on every request. Keying the cache by
    // language keeps the string *stable*, not merely equal.
    const llm = new SpyProvider();
    const agent = new ProbeAgent(llm);

    await inLanguage('ar', () => agent.ask());
    await inLanguage('ar', () => agent.ask());
    await inLanguage('en', () => agent.ask());

    expect(llm.calls[0].system).toBe(llm.calls[1].system);
    expect(llm.calls[2].system).not.toBe(llm.calls[0].system);
  });

  it('falls back to English outside any request rather than throwing', async () => {
    const llm = new SpyProvider();
    await new ProbeAgent(llm).ask();

    expect(llm.calls[0].system).toContain(outputLanguageRules('en'));
  });
});

describe('detection and coercion', () => {
  it('reads a mostly-Arabic idea as Arabic even with English tech terms', () => {
    expect(detectArtifactLanguage('نظام إدارة مكتبة مبني على React')).toBe('ar');
    expect(detectArtifactLanguage('A library management system')).toBe('en');
  });

  it('defaults rather than guessing on junk, and accepts a regional variant', () => {
    expect(toArtifactLanguage('ar-EG')).toBe('ar');
    expect(toArtifactLanguage('fr')).toBe('en');
    expect(toArtifactLanguage(undefined)).toBe('en');
  });

  it('treats an UNSTAMPED artifact as English, never as the viewer locale', () => {
    // Rows written before this existed are English. Relabelling them would send a
    // reader looking for a translation that was never there — the same rule as an
    // unstamped `sourceStamp` never being stale.
    expect(artifactLanguageOf(undefined)).toBe('en');
    expect(artifactLanguageOf({})).toBe('en');
    expect(artifactTextDirection('ar')).toBe('rtl');
  });
});

/**
 * Bug V: a sentence composed in CODE around a value written by the MODEL.
 *
 * The reported symptom was `Confirm لا توجد منافسة محددة is a real competitor
 * here, and check how it is positioned.` — an English template wrapped around an
 * Arabic value, grammatical in neither language, in a document the owner was
 * about to forward to a client.
 */
describe('code-composed sentences are localized as WHOLE sentences', () => {
  const analysisIn = (language: ArtifactLanguage): BusinessAnalysis =>
    ({
      sessionId: 's1',
      generatedAt: '2026-07-21T00:00:00.000Z',
      language,
      problem: {
        problem: 'p',
        whoHasIt: 'w',
        currentAlternative: 'c',
        costOfInaction: 'k',
      },
      segments: [],
      competitors: [
        {
          name: 'منصة الكتب',
          category: 'c',
          positioning: 'p',
          strengths: [],
          weaknesses: [],
          confidence: 'unverified',
        },
      ],
      market: {
        demandSignals: [],
        headwinds: [],
        sizeNote: 's',
        confidence: 'stated',
      },
      usp: { statement: 'u', differentiators: [], defensibility: 'd' },
      mvp: {
        verdict: 'well-scoped',
        reasoning: 'r',
        recommendedCore: [],
        deferSuggestions: [],
      },
      verdict: 'proceed',
      verdictRationale: 'v',
      researchChecklist: [],
    }) as BusinessAnalysis;

  it('builds the research checklist in the artifact’s own language', () => {
    const { researchChecklist } = withResearchChecklist(analysisIn('ar'));
    const item = researchChecklist[0];

    expect(item).toContain('منصة الكتب');
    // The reported bug, asserted directly: no English template around the value.
    expect(item).not.toMatch(/is a real competitor/);
    expect(item).toMatch(/^تأكّد/);
  });

  it('still reads correctly in English', () => {
    const { researchChecklist } = withResearchChecklist(analysisIn('en'));
    expect(researchChecklist[0]).toMatch(/^Confirm .+ is a real competitor here/);
  });

  it('reads the language off the ARTIFACT, since normalizers run with no session', () => {
    // `normalizeBusinessAnalysis` runs at both repository read boundaries, where
    // there is no session to ask. The stamp on the artifact is the only source
    // that survives that trip.
    const normalized = normalizeBusinessAnalysis(analysisIn('ar'));
    expect(normalized.researchChecklist.join(' ')).not.toMatch(/[A-Za-z]{6,}/);
  });

  /**
   * `stripMetrics` edits the model's own prose, so its replacements have to be
   * in the language of the sentence they land in — and its *patterns* have to
   * match that language too. Every assertion here checks the **whole output**,
   * not merely that the figure is gone: this replacement once shipped a literal
   * `$2` into a sentence an owner could forward, because the test only asserted
   * the absence.
   */
  describe('stripMetrics', () => {
    it('reads correctly in English', () => {
      expect(stripMetrics('Serves 10,000 customers', 'en')).toBe(
        'Serves a number of customers',
      );
      expect(stripMetrics('Raised $4M last year', 'en')).toBe(
        'raised funding last year',
      );
      expect(stripMetrics('founded in 1998', 'en')).toBe('established');
    });

    it('matches Arabic-Indic digits and Arabic units, which it used to ignore', () => {
      // The guard was a silent no-op on Arabic prose: still running, still
      // passing its English tests, and no longer removing anything.
      expect(stripMetrics('تخدم ١٠٬٠٠٠ عميل', 'ar')).toBe('تخدم عدد من العملاء');
      expect(stripMetrics('لديها 500 مستخدم', 'ar')).toBe('لديها عدد من المستخدمين');
      expect(stripMetrics('تأسست عام ١٩٩٨', 'ar')).toBe('قائمة منذ سنوات');
    });

    it('never fuses two words together when a language skips the collapse', () => {
      // An empty `raisedPrefixes` built `(?:)\s+…`, whose empty group matched the
      // empty string and swallowed the preceding space: `جمعتحصلت على تمويل`.
      expect(stripMetrics('جمعت $4 مليون في تمويل', 'ar')).toBe(
        'جمعت مبلغ غير معلن في تمويل',
      );
    });

    it('leaves prose with no metric in it completely alone', () => {
      expect(stripMetrics('منصة قوية في السوق', 'ar')).toBe('منصة قوية في السوق');
      expect(stripMetrics('A clean sentence', 'en')).toBe('A clean sentence');
    });
  });

  it('localizes the provenance notes the requirement document appends', () => {
    const ar = unsourcedRoleAssumption('Customer Service', 'ar');
    expect(ar.assumption).toContain('Customer Service'); // a proper noun, kept
    expect(ar.assumption).not.toMatch(/Assumed the project/);
    expect(extractionGapAssumption('ar').impactIfWrong).not.toMatch(/[A-Za-z]{5,}/);
  });

  it('localizes the automated consistency findings', () => {
    const findings = buildConsistencyFindings({
      language: 'ar',
      constraints: ['يجب أن يتكامل النظام مع بوابات الدفع'],
      constraintCompliance: [],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('قيد غير مُعالَج في التصميم');
    expect(findings[0].detail).toContain('بوابات الدفع');
    expect(findings[0].detail).not.toMatch(/constraint/i);
  });

  it('defaults a caller that has not been updated to English, not to broken output', () => {
    const findings = buildConsistencyFindings({
      constraints: ['PCI DSS'],
      constraintCompliance: [],
    });
    expect(findings[0].title).toBe('Constraint not addressed in the design');
  });
});
