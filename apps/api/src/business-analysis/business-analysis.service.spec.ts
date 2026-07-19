import {
  MARKET_HONESTY_RULES,
  normalizeBusinessAnalysis,
  stripMetrics,
  toClaimConfidence,
  toMvpVerdict,
  toViabilityVerdict,
  withResearchChecklist,
  type BusinessAnalysis,
  type RequirementsSummary,
} from '@archivato/shared';
import { BusinessAnalystAgent } from '../llm/agents/business-analyst.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { RequirementEngineerAgent } from '../llm/agents/requirement-engineer.agent';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import type { InterviewSession } from '../interview/interview-session.entity';
import { InMemoryBusinessAnalysisRepository } from './in-memory-business-analysis.repository';
import { BusinessAnalysisService } from './business-analysis.service';

const SUMMARY: RequirementsSummary = {
  goal: 'Let clinics book and track patient appointments.',
  users: ['Receptionist', 'Doctor'],
  features: ['Book appointment', 'Reschedule', 'Reminders', 'Reporting'],
  businessRules: [],
  constraints: [],
  assumptions: [],
};

/** A session in whatever state the test needs, without driving the interview. */
async function seedSession(
  sessions: InMemoryInterviewSessionRepository,
  over: Partial<InterviewSession> = {},
): Promise<string> {
  const session: InterviewSession = {
    id: 's1',
    userId: 'u1',
    input: { idea: 'A clinic appointment system', industry: 'healthcare' },
    title: null,
    clientName: null,
    weeklyRate: null,
    status: 'confirmed',
    intent: null,
    history: [],
    pendingQuestion: null,
    coverage: 1,
    summary: SUMMARY,
    slots: {
      business_domain: { value: 'Clinic scheduling', confidence: 'high', source: 'explicit' },
      target_users_roles: {
        value: 'Receptionist, Doctor, Patient',
        confidence: 'high',
        source: 'explicit',
      },
      core_workflows: {
        value: 'Book an appointment; send a reminder',
        confidence: 'high',
        source: 'explicit',
      },
    },
    openQuestions: null,
    ...over,
  } as InterviewSession;
  await sessions.create(session);
  return session.id;
}

const confirmedSession = (sessions: InMemoryInterviewSessionRepository) =>
  seedSession(sessions);

function build() {
  const sessions = new InMemoryInterviewSessionRepository();
  const analyses = new InMemoryBusinessAnalysisRepository();
  const llm = new MockLlmProvider();
  const service = new BusinessAnalysisService(
    sessions,
    analyses,
    new BusinessAnalystAgent(llm),
  );
  return { sessions, analyses, llm, service };
}

describe('BusinessAnalysisService', () => {
  it('refuses to run before the interview is confirmed', async () => {
    const { sessions, service } = build();
    const id = await seedSession(sessions, { status: 'collecting' });

    await expect(service.generate(id)).rejects.toThrow(
      /requires a confirmed interview/i,
    );
  });

  it('404s a session that does not exist', async () => {
    const { service } = build();
    await expect(service.generate('nope')).rejects.toThrow(/not found/i);
  });

  it('generates from a confirmed interview and persists it', async () => {
    const { sessions, analyses, service } = build();
    const id = await confirmedSession(sessions);

    const analysis = await service.generate(id);

    expect(analysis.sessionId).toBe(id);
    expect(analysis.segments.length).toBeGreaterThan(0);
    expect(await analyses.findBySessionId(id)).toEqual(analysis);
  });
});

describe('the offline fallback refuses to invent a market', () => {
  it('emits no competitors at all', async () => {
    const { sessions, service } = build();
    const id = await confirmedSession(sessions);

    // The default mock responder echoes the prompt, which fails isValid — so
    // this is the deterministic path, which is what an install with no provider
    // ships for every project.
    const analysis = await service.generate(id);

    // Every other agent's fallback approximates the model. This one must not:
    // offline, the code knows the interview and nothing else, and a plausible
    // competitor list would be pure fabrication.
    expect(analysis.competitors).toEqual([]);
    expect(analysis.market.demandSignals).toEqual([]);
    expect(analysis.verdict).toBe('needs-validation');
  });

  it('still states the problem and segments, which it CAN know', async () => {
    const { sessions, service } = build();
    const id = await confirmedSession(sessions);

    const analysis = await service.generate(id);

    expect(analysis.problem.problem).toContain('appointments');
    expect(analysis.segments.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Receptionist', 'Doctor']),
    );
  });

  it('says out loud that the market was not assessed', async () => {
    const { sessions, service } = build();
    const id = await confirmedSession(sessions);

    const analysis = await service.generate(id);

    expect(analysis.market.sizeNote).toMatch(/not assessed/i);
    expect(analysis.verdictRationale).toMatch(/without an AI provider/i);
  });
});

describe('MARKET_HONESTY_RULES', () => {
  it('is embedded verbatim in the analyst system prompt', () => {
    // The R13 HONESTY_RULES precedent: the ban is literal prompt text a test
    // pins, not a paraphrase a later edit can quietly soften.
    const prompt = (
      new BusinessAnalystAgent(new MockLlmProvider()) as unknown as {
        systemPrompt: string;
      }
    ).systemPrompt;

    expect(prompt).toContain(MARKET_HONESTY_RULES);
  });

  it('bans every metric a model would invent most fluently', () => {
    for (const banned of [
      'funding amount',
      'valuation',
      'revenue figure',
      'user or customer',
      'employee count',
      'founding date',
      'market size in dollars',
    ]) {
      expect(MARKET_HONESTY_RULES).toContain(banned);
    }
  });

  it('tells the model an empty competitor list beats an invented one', () => {
    expect(MARKET_HONESTY_RULES).toMatch(/empty competitor list.*beats an invented one/i);
  });
});

describe('stripMetrics — the backstop when the prompt does not hold', () => {
  it.each([
    ['Raised $4M in Series A', /\$4M/],
    ['Serves 10,000 customers', /10,000 customers/],
    ['Founded in 2019 by two engineers', /founded in 2019/i],
  ])('removes the unverifiable figure from %p', (input, pattern) => {
    expect(stripMetrics(input)).not.toMatch(pattern);
  });

  it('leaves a claim with no metrics untouched', () => {
    const clean = 'A general-purpose booking tool aimed at small clinics';
    expect(stripMetrics(clean)).toBe(clean);
  });
});

describe('withResearchChecklist — unverified claims are never silent', () => {
  const base: BusinessAnalysis = {
    sessionId: 's1',
    generatedAt: 'now',
    problem: { problem: 'p', whoHasIt: 'w', currentAlternative: 'c', costOfInaction: 'x' },
    segments: [{ name: 'A', description: 'd', jobToBeDone: 'j', painPoints: [] }],
    competitors: [],
    market: { demandSignals: [], headwinds: [], sizeNote: 'n', confidence: 'inferred' },
    usp: { statement: 's', differentiators: [], defensibility: 'd' },
    mvp: { verdict: 'well-scoped', reasoning: 'r', recommendedCore: [], deferSuggestions: [] },
    verdict: 'proceed',
    verdictRationale: 'r',
    researchChecklist: [],
  };

  it('adds an entry for every unverified competitor', () => {
    const out = withResearchChecklist({
      ...base,
      competitors: [
        {
          name: 'Acme Booking',
          category: 'booking SaaS',
          positioning: 'p',
          strengths: [],
          weaknesses: [],
          confidence: 'unverified',
        },
      ],
    });

    expect(out.researchChecklist.join(' ')).toContain('Acme Booking');
  });

  it('flags an empty competitor list rather than implying there is no competition', () => {
    expect(withResearchChecklist(base).researchChecklist.join(' ')).toMatch(
      /no competitors were identified/i,
    );
  });

  it('adds an entry when the market read is unverified', () => {
    const out = withResearchChecklist({
      ...base,
      market: { ...base.market, confidence: 'unverified' },
    });

    expect(out.researchChecklist.join(' ')).toMatch(/verify the market read/i);
  });

  it('does not duplicate an entry the model already wrote', () => {
    const existing = 'No competitors were identified — research who else serves these users.';
    const out = withResearchChecklist({ ...base, researchChecklist: [existing] });

    expect(out.researchChecklist.filter((c) => c === existing)).toHaveLength(1);
  });
});

describe('sanitizers default to the cautious answer', () => {
  it('reads an unknown confidence as unverified, never as established', () => {
    expect(toClaimConfidence('definitely-true')).toBe('unverified');
    expect(toClaimConfidence(undefined)).toBe('unverified');
    expect(toClaimConfidence('stated')).toBe('stated');
  });

  it('reads an unknown verdict as needs-validation', () => {
    expect(toViabilityVerdict('slam-dunk')).toBe('needs-validation');
    expect(toViabilityVerdict('proceed')).toBe('proceed');
  });

  it('names the replacement instead of leaking a regex backreference', () => {
    // `$2` with one capture group is emitted literally — the owner reads
    // "a number of $2" in a section they may forward to a client.
    expect(stripMetrics('Serves 10,000 customers')).toBe('Serves a number of customers');
    expect(stripMetrics('Over 500 users today')).toBe('Over a number of users today');
    expect(stripMetrics('x')).not.toContain('$2');
  });

  it('defaults an unusable MVP verdict without claiming it was assessed', () => {
    expect(toMvpVerdict('enormous')).toBe('well-scoped');
    // The neutral verdict must not read as a judgement nobody made.
    const shaped = normalizeBusinessAnalysis({
      ...({} as BusinessAnalysis),
      competitors: [],
      mvp: { verdict: 'enormous' as never, reasoning: undefined as never, recommendedCore: [], deferSuggestions: [] },
    });
    expect(shaped.mvp.reasoning).toMatch(/not assessed/i);
  });
});

describe('normalizeBusinessAnalysis — a required array is never undefined', () => {
  /** What `isValid` lets through: the three checked fields and nothing else. */
  const barelyValid = {
    sessionId: 's1',
    generatedAt: 'now',
    problem: { problem: 'A real problem' },
    segments: [{ name: 'Owner' }],
    usp: { statement: 'Faster than the spreadsheet' },
  } as unknown as BusinessAnalysis;

  it('fills every array the view calls .join()/.length on', () => {
    const shaped = normalizeBusinessAnalysis(barelyValid);

    // Each of these took out the whole tab before, on a model response that
    // passed validation.
    expect(shaped.segments[0].painPoints).toEqual([]);
    expect(shaped.usp.differentiators).toEqual([]);
    expect(shaped.market.demandSignals).toEqual([]);
    expect(shaped.mvp.recommendedCore).toEqual([]);
    expect(shaped.problem.whoHasIt).toBe('');
  });

  it('treats a mistyped array as empty, not as a value', () => {
    // `?? []` passes a string straight through to `.map`.
    const shaped = normalizeBusinessAnalysis({
      ...barelyValid,
      market: { demandSignals: 'strong local demand', headwinds: null, sizeNote: 'local', confidence: 'inferred' },
    } as unknown as BusinessAnalysis);

    expect(shaped.market.demandSignals).toEqual([]);
    expect(shaped.market.headwinds).toEqual([]);
  });

  it('drops a competitor entry that is not an object', () => {
    const shaped = normalizeBusinessAnalysis({
      ...barelyValid,
      competitors: [null, 'Acme', { name: 'Real Co' }],
    } as unknown as BusinessAnalysis);

    expect(shaped.competitors.map((c) => c.name)).toEqual(['Real Co']);
  });

  it('still backfills the research checklist', () => {
    expect(normalizeBusinessAnalysis(barelyValid).researchChecklist.length).toBeGreaterThan(0);
  });
});

describe('the analysis FEEDS requirements without gating them', () => {
  const analysis: BusinessAnalysis = {
    sessionId: 's1',
    generatedAt: 'now',
    problem: {
      problem: 'Receptionists lose an hour a day to phone rescheduling',
      whoHasIt: 'Clinic receptionists',
      currentAlternative: 'A paper diary and a phone',
      costOfInaction: 'Missed appointments',
    },
    segments: [
      { name: 'Receptionist', description: 'd', jobToBeDone: 'Fill the day', painPoints: [] },
    ],
    competitors: [
      {
        name: 'SomeBookingApp',
        category: 'booking SaaS',
        positioning: 'Generic scheduling',
        strengths: [],
        weaknesses: [],
        confidence: 'unverified',
      },
    ],
    market: {
      demandSignals: ['Clinics already pay for scheduling'],
      headwinds: ['Crowded category'],
      sizeNote: 'Fragmented and local',
      confidence: 'unverified',
    },
    usp: {
      statement: 'Built for the receptionist, not the doctor',
      differentiators: ['One-tap reschedule'],
      defensibility: 'A competitor could copy it',
    },
    mvp: {
      verdict: 'too-large',
      reasoning: 'Reporting can wait',
      recommendedCore: ['Book appointment', 'Reschedule'],
      deferSuggestions: ['Reporting'],
    },
    verdict: 'proceed-with-changes',
    verdictRationale: 'Trim the first release.',
    researchChecklist: [],
  };

  /** Capture the prompt the requirement engineer actually sends. */
  function capturingAgent() {
    const prompts: string[] = [];
    const llm = new MockLlmProvider((messages) => {
      prompts.push(messages.map((m) => m.content).join('\n'));
      return 'not json';
    });
    return { prompts, agent: new RequirementEngineerAgent(llm) };
  }

  const ctx = {
    idea: 'A clinic appointment system',
    intent: null,
    history: [],
    summary: SUMMARY,
  };

  it('puts the business case in the prompt when an analysis exists', async () => {
    const { prompts, agent } = capturingAgent();

    await agent.generate('s1', { ...ctx, businessAnalysis: analysis });

    expect(prompts[0]).toContain('BUSINESS CASE');
    expect(prompts[0]).toContain('Receptionists lose an hour a day');
    expect(prompts[0]).toContain('Built for the receptionist');
    // The MVP assessment steers priority, which is the point of running first.
    expect(prompts[0]).toContain('Reporting');
  });

  it('never leaks the unverified competitor or market read into the document', async () => {
    const { prompts, agent } = capturingAgent();

    await agent.generate('s1', { ...ctx, businessAnalysis: analysis });

    // These are the analyst's recollection, they say nothing about what the
    // system must do, and the requirement document is what the CLIENT reads —
    // letting them cross would launder a guess into a requirement.
    expect(prompts[0]).not.toContain('SomeBookingApp');
    expect(prompts[0]).not.toContain('Crowded category');
    expect(prompts[0]).not.toContain('Fragmented and local');
  });

  it('still generates a document when no analysis was ever run', async () => {
    const { prompts, agent } = capturingAgent();

    // Every project created before this stage existed has no analysis; the
    // stage feeds requirements but must never gate them.
    const doc = await agent.generate('s1', ctx);

    expect(prompts[0]).not.toContain('BUSINESS CASE');
    expect(doc.functional.length).toBeGreaterThan(0);
  });
});
