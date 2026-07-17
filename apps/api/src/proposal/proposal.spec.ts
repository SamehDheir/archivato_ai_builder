import {
  appendProposalDraft,
  buildFallbackProposal,
  CHANNEL_DEFAULT_LOCALE,
  HONESTY_RULES,
  isOverLength,
  proposalCharCount,
  PROPOSAL_CEILINGS,
  PROPOSAL_CHANNELS,
  PROPOSAL_DRAFT_LIMIT,
  PROPOSAL_LOCALES,
  resolveProposalLocale,
  topCapabilities,
  type ProposalChannel,
  type ProposalDraft,
  type ProposalInput,
  type ProposalLocale,
} from '@archivato/shared';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { LlmMessage } from '../llm/llm-provider.interface';
import { ProposalWriterAgent } from '../llm/agents/proposal-writer.agent';

const SHARE_URL = 'https://archivato.dev/s/AbC123token';
const PRICE = '$6,000 – $9,000';

function input(overrides: Partial<ProposalInput> = {}): ProposalInput {
  return {
    channel: 'upwork',
    locale: 'en',
    clientName: 'Sarah',
    senderName: 'Ahmad',
    companyName: 'Nexus Software',
    variant: 0,
    facts: {
      title: 'HomeHelper',
      idea: 'A booking app for home-cleaning visits with online payment.',
      executiveSummary:
        'HomeHelper lets homeowners book vetted cleaning visits and pay online. Providers manage their own availability and get paid out weekly. It replaces the phone-and-notebook process the business runs today.',
      capabilities: [
        'Customers can book an available time slot',
        'Customers can pay securely at booking',
        'Providers can manage their availability',
        'Admins can review payouts',
      ],
      effortWeeksMin: 8,
      effortWeeksMax: 12.5,
      mvpStatement: 'A customer can book and pay for one visit end to end.',
      timeline: '3 months',
      shareUrl: SHARE_URL,
      ...overrides.facts,
    },
    ...overrides,
  };
}

describe('proposal — deterministic fallback', () => {
  it('produces a sendable message within the ceiling for every channel × locale', () => {
    for (const channel of PROPOSAL_CHANNELS) {
      for (const locale of PROPOSAL_LOCALES) {
        const message = buildFallbackProposal(input({ channel, locale }));

        expect(proposalCharCount(message)).toBeGreaterThan(80);
        expect(isOverLength(message, channel)).toBe(false);
        // The whole point of the message: the link has to be in it.
        expect(message).toContain(SHARE_URL);
        // And it has to end asking something, not "let me know".
        expect(message).toMatch(/[?؟]/);
      }
    }
  });

  it('writes Arabic for the Arabic locale and English for English', () => {
    const ar = buildFallbackProposal(input({ locale: 'ar', channel: 'mostaql' }));
    const en = buildFallbackProposal(input({ locale: 'en', channel: 'upwork' }));

    expect(ar).toMatch(/[؀-ۿ]/);
    expect(en).not.toMatch(/[؀-ۿ]/);
    // Arabic numerals stay Latin — a week count in Arabic-Indic digits pasted into
    // a marketplace form is a support ticket.
    expect(ar).not.toMatch(/[٠-٩]/);
  });

  it('keeps the link, price and closing question even on the tightest channel', () => {
    // Mostaql (700) is the tightest ceiling, so this is where the budget ladder
    // actually bites — and the three things it must never drop.
    const message = buildFallbackProposal(
      input({ channel: 'mostaql', locale: 'ar', price: PRICE }),
    );

    expect(isOverLength(message, 'mostaql')).toBe(false);
    expect(message).toContain(SHARE_URL);
    expect(message).toContain(PRICE);
    expect(message).toMatch(/[?؟]/);
  });

  it('never truncates: an unfittable message comes back whole and flagged', () => {
    // A hook the owner insisted on, longer than the entire ceiling.
    const hook = 'x'.repeat(1200);
    const message = buildFallbackProposal(input({ channel: 'mostaql', customHook: hook }));

    expect(message).toContain(hook);
    expect(message).toContain(SHARE_URL);
    expect(isOverLength(message, 'mostaql')).toBe(true);
  });

  it('regenerating with a new variant changes the message', () => {
    const first = buildFallbackProposal(input({ variant: 0 }));
    const second = buildFallbackProposal(input({ variant: 1 }));

    expect(second).not.toEqual(first);
    // …but it stays a pure function of its input.
    expect(buildFallbackProposal(input({ variant: 1 }))).toEqual(second);
  });

  it('degrades cleanly when the scoping is thin (no summary, effort, MVP or timeline)', () => {
    const message = buildFallbackProposal(
      input({
        facts: {
          title: 'HomeHelper',
          idea: 'A booking app for home-cleaning visits.',
          capabilities: [],
          shareUrl: SHARE_URL,
        },
      }),
    );

    expect(message).toContain(SHARE_URL);
    expect(message).not.toContain('undefined');
    expect(message).not.toMatch(/NaN/);
  });
});

describe('proposal — the price is opt-in', () => {
  it('states the price verbatim when the owner opted in', () => {
    for (const locale of PROPOSAL_LOCALES) {
      const message = buildFallbackProposal(input({ locale, price: PRICE }));
      expect(message).toContain(PRICE);
    }
  });

  it('emits no price or currency token when the owner did not', () => {
    for (const channel of PROPOSAL_CHANNELS) {
      for (const locale of PROPOSAL_LOCALES) {
        // `price` absent — exactly what the service builds when includePrice is false.
        const message = buildFallbackProposal(input({ channel, locale }));

        expect(message).not.toContain(PRICE);
        expect(message).not.toMatch(/[$€£]|\bUSD\b|\bEUR\b|دولار|السعر|\bPrice\b/i);
      }
    }
  });

  it('never lets a price reach the prompt when the owner did not opt in', async () => {
    // The enforcement is the absence of the field, not an instruction — so the
    // check that matters is that no figure is in the prompt at all.
    const prompts: string[] = [];
    const llm = new MockLlmProvider((messages: LlmMessage[]) => {
      prompts.push(messages.map((m) => m.content).join('\n'));
      return JSON.stringify({ message: `Hi Sarah, scoping is here: ${SHARE_URL} What first?` });
    });

    await new ProposalWriterAgent(llm).write(input());

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain(PRICE);
    expect(prompts[0]).not.toContain('6,000');
    expect(prompts[0]).not.toMatch(/[$€£]\s?\d/);
  });

  it('passes the owner’s exact words through to the prompt when they did', async () => {
    const prompts: string[] = [];
    const llm = new MockLlmProvider((messages: LlmMessage[]) => {
      prompts.push(messages.map((m) => m.content).join('\n'));
      return JSON.stringify({ message: `Hi. ${SHARE_URL}. ${PRICE}. What first?` });
    });

    await new ProposalWriterAgent(llm).write(input({ price: PRICE }));

    expect(prompts[0]).toContain(PRICE);
  });
});

describe('proposal — length ceiling enforcement', () => {
  /** A scripted LLM whose replies are queued in order. */
  function scripted(...messages: string[]): MockLlmProvider {
    const llm = new MockLlmProvider();
    for (const message of messages) llm.enqueue(JSON.stringify({ message }));
    return llm;
  }

  const fits = `Hi Sarah, the scoping is here: ${SHARE_URL} — 8–12 weeks. What first?`;
  const tooLong = `${'A very long paragraph of filler. '.repeat(40)} ${SHARE_URL}`;

  it('accepts a first draft that fits, with no retry', async () => {
    const llm = scripted(fits, fits);
    const calls = jest.spyOn(llm, 'completeJson');

    const result = await new ProposalWriterAgent(llm).write(input({ channel: 'upwork' }));

    expect(result).toEqual({ message: fits, source: 'llm' });
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it('retries once with a shorten instruction when the first draft is over', async () => {
    const prompts: string[] = [];
    const llm = new MockLlmProvider();
    llm.enqueue(JSON.stringify({ message: tooLong }));
    llm.enqueue(JSON.stringify({ message: fits }));
    jest
      .spyOn(llm, 'completeJson')
      .mockImplementation(async function (this: MockLlmProvider, messages, options) {
        prompts.push(messages.map((m) => m.content).join('\n'));
        return MockLlmProvider.prototype.completeJson.call(this, messages, options) as never;
      });

    const result = await new ProposalWriterAgent(llm).write(input({ channel: 'upwork' }));

    expect(result).toEqual({ message: fits, source: 'llm' });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('SHORTER');
    expect(prompts[1]).toContain(String(PROPOSAL_CEILINGS.upwork));
  });

  it('returns the shorter draft, whole and un-truncated, when the retry is still over', async () => {
    // Shorter than the first draft, but still past the ceiling — the case where
    // the model tried and missed.
    const shorter = `${'Still slightly too long. '.repeat(40)} ${SHARE_URL}`;
    expect(proposalCharCount(shorter)).toBeGreaterThan(PROPOSAL_CEILINGS.upwork);
    expect(proposalCharCount(shorter)).toBeLessThan(proposalCharCount(tooLong));

    const result = await new ProposalWriterAgent(scripted(tooLong, shorter)).write(
      input({ channel: 'upwork' }),
    );

    // Never cut to the ceiling — the caller flags it and the owner trims it.
    expect(result.message).toEqual(shorter);
    expect(isOverLength(result.message, 'upwork')).toBe(true);
  });

  it('keeps the long first draft when the shorten retry itself fails', async () => {
    // The retry is the second billed call; when it dies, the first draft is still
    // a real, sendable message that the owner paid for — it is only long. Dropping
    // to the template here would hand back a worse message AND claim the AI was
    // unavailable, which it wasn't.
    const llm = new MockLlmProvider();
    llm.enqueue(JSON.stringify({ message: tooLong }));
    llm.setResponder(() => {
      throw new Error('network blip');
    });

    const result = await new ProposalWriterAgent(llm).write(input({ channel: 'upwork' }));

    expect(result).toEqual({ message: tooLong, source: 'llm' });
    expect(isOverLength(result.message, 'upwork')).toBe(true);
  });

  it('falls back to the template when the model returns nothing usable', async () => {
    const llm = new MockLlmProvider(() => 'not json at all');
    const result = await new ProposalWriterAgent(llm).write(input());

    expect(result.source).toBe('fallback');
    expect(result.message).toContain(SHARE_URL);
    expect(isOverLength(result.message, 'upwork')).toBe(false);
  });
});

describe('proposal — honesty guard', () => {
  it('embeds every no-credentials rule in the system prompt', async () => {
    let system = '';
    const llm = new MockLlmProvider((_m, options) => {
      system = options?.system ?? '';
      return JSON.stringify({ message: 'ok' });
    });

    await new ProposalWriterAgent(llm).write(input());

    for (const rule of HONESTY_RULES) expect(system).toContain(rule);
    expect(system).toMatch(/NEVER claim past experience/);
    expect(system).toMatch(/team size/);
    expect(system).toMatch(/superlatives/);
  });

  it('makes no claim about the sender in the deterministic path', () => {
    for (const locale of PROPOSAL_LOCALES) {
      const message = buildFallbackProposal(input({ locale }));
      expect(message).not.toMatch(
        /\byears?\b|\bexperien|\bexpert\b|\bleading\b|\bbest\b|\bteam of\b|خبرة|أفضل|سنوات/i,
      );
    }
  });
});

describe('proposal — locale resolution', () => {
  it('defaults Mostaql to Arabic and Upwork to English', () => {
    expect(resolveProposalLocale('mostaql')).toBe('ar');
    expect(resolveProposalLocale('upwork')).toBe('en');
    expect(CHANNEL_DEFAULT_LOCALE.email).toBeNull();
  });

  it('falls back to the project locale only where the channel has no opinion', () => {
    expect(resolveProposalLocale('email', undefined, 'ar')).toBe('ar');
    expect(resolveProposalLocale('generic', undefined, 'ar')).toBe('ar');
    // A channel default outranks the project locale…
    expect(resolveProposalLocale('mostaql', undefined, 'en')).toBe('ar');
    // …and an explicit choice outranks everything.
    expect(resolveProposalLocale('mostaql', 'en', 'ar')).toBe('en');
  });

  it('ignores an unusable project locale rather than guessing', () => {
    expect(resolveProposalLocale('email', undefined, 'fr')).toBe('en');
    expect(resolveProposalLocale('email', undefined, null)).toBe('en');
  });
});

describe('proposal — draft history', () => {
  const draft = (id: string): ProposalDraft => ({
    id,
    channel: 'upwork' as ProposalChannel,
    locale: 'en' as ProposalLocale,
    message: `draft ${id}`,
    charCount: 7,
    ceiling: PROPOSAL_CEILINGS.upwork,
    overLength: false,
    shareUrl: SHARE_URL,
    includedPrice: false,
    source: 'llm',
    createdAt: new Date().toISOString(),
  });

  it('keeps drafts newest first', () => {
    const history = appendProposalDraft(appendProposalDraft(null, draft('1')), draft('2'));
    expect(history.map((d) => d.id)).toEqual(['2', '1']);
  });

  it(`caps the history at ${PROPOSAL_DRAFT_LIMIT}, dropping the oldest`, () => {
    let history: ProposalDraft[] = [];
    for (let i = 1; i <= 8; i++) history = appendProposalDraft(history, draft(String(i)));

    expect(history).toHaveLength(PROPOSAL_DRAFT_LIMIT);
    expect(history.map((d) => d.id)).toEqual(['8', '7', '6', '5', '4']);
  });

  it('treats a null history as empty (every row predating the column)', () => {
    expect(appendProposalDraft(null, draft('1'))).toHaveLength(1);
    expect(appendProposalDraft(undefined, draft('1'))).toHaveLength(1);
  });
});

describe('proposal — capability selection', () => {
  it('takes musts first and caps at five', () => {
    const caps = topCapabilities([
      { title: 'Could A', priority: 'could' },
      { title: 'Must A', priority: 'must' },
      { title: 'Should A', priority: 'should' },
      { title: 'Must B', priority: 'must' },
      { title: 'Must C', priority: 'must' },
      { title: 'Must D', priority: 'must' },
      { title: 'Must E', priority: 'must' },
    ]);

    expect(caps).toHaveLength(5);
    expect(caps.slice(0, 5)).toEqual(['Must A', 'Must B', 'Must C', 'Must D', 'Must E']);
  });

  it('tolerates an absent or empty requirement list', () => {
    expect(topCapabilities(undefined)).toEqual([]);
    expect(topCapabilities([])).toEqual([]);
  });
});
