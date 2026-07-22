/**
 * Two reliability problems, reproduced twice on the same inputs:
 *   1. ungrounded named specifics (competitors, laws, ministries, initiatives)
 *      that the model produced from memory and the "unverified" badge dressed up
 *      as researched; and
 *   2. those facts churning between two runs of the SAME interview.
 *
 * There is no web-search capability here (the `LlmProvider` seam has none), so
 * the fix is not "ground them" but "don't fabricate them, and don't let them
 * reshuffle": generalize named specifics the interview cannot vouch for, and pin
 * the researched facts across re-runs so only the framing varies.
 */

import {
  businessAnalysisInputsFingerprint,
  carryOverFacts,
  diffBusinessAnalysisFacts,
  screenUngroundedSpecifics,
  stripUngroundedSpecifics,
  type BusinessAnalysis,
  type RequirementsSummary,
} from '@archivato/shared';
import { BusinessAnalystAgent } from '../llm/agents/business-analyst.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { InMemoryInterviewSessionRepository } from '../interview/in-memory-interview-session.repository';
import type { InterviewSession } from '../interview/interview-session.entity';
import { InMemoryBusinessAnalysisRepository } from './in-memory-business-analysis.repository';
import { BusinessAnalysisService } from './business-analysis.service';

// ── the named-specifics backstop (pure) ─────────────────────────────────────

describe('stripUngroundedSpecifics — a named specific the interview cannot vouch for', () => {
  it('generalizes a regulation acronym the client never stated', () => {
    const { text, changed } = stripUngroundedSpecifics(
      'The product must comply with GDPR and HIPAA.',
      'A booking app for small clinics.',
    );
    expect(changed).toBe(true);
    expect(text).not.toMatch(/GDPR|HIPAA/);
    expect(text).toMatch(/applicable regulation/i);
  });

  it('KEEPS a regulation the client named — that one is grounded', () => {
    const { text, changed } = stripUngroundedSpecifics(
      'Must meet PDPL requirements.',
      'We operate in Saudi Arabia and need PDPL compliance.',
    );
    expect(changed).toBe(false);
    expect(text).toContain('PDPL');
  });

  it('generalizes a named ministry and a national initiative', () => {
    const ministry = stripUngroundedSpecifics(
      'Overseen by the Ministry of Digital Affairs.',
      'a delivery app',
    );
    expect(ministry.text).not.toMatch(/Ministry of Digital Affairs/);

    const initiative = stripUngroundedSpecifics(
      'Aligned with Vision 2030 goals.',
      'a delivery app',
    );
    expect(initiative.text).not.toMatch(/Vision 2030/);
  });

  it('does not touch a common-noun body — "Certificate Authority" is not a regulator', () => {
    const { text, changed } = stripUngroundedSpecifics(
      'Signed by a trusted Certificate Authority.',
      'a payments app',
    );
    expect(changed).toBe(false);
    expect(text).toContain('Certificate Authority');
  });

  it('does not gut legitimate uppercase tokens that are not regulations', () => {
    const { text, changed } = stripUngroundedSpecifics(
      'A SaaS API syncing with the clinic EHR.',
      'a clinic app',
    );
    expect(changed).toBe(false);
    expect(text).toBe('A SaaS API syncing with the clinic EHR.');
  });

  it('handles an Arabic ministry reference', () => {
    const { text, changed } = stripUngroundedSpecifics(
      'تُنظِّمه وزارة الصحة في البلد.',
      'تطبيق حجوزات',
      'ar',
    );
    expect(changed).toBe(true);
    expect(text).not.toContain('وزارة الصحة');
  });
});

describe('screenUngroundedSpecifics — the whole artifact, plus the checklist trail', () => {
  const base: BusinessAnalysis = {
    sessionId: 's1',
    generatedAt: 'now',
    problem: { problem: 'p', whoHasIt: '', currentAlternative: '', costOfInaction: '' },
    segments: [{ name: 'User', description: '', jobToBeDone: '', painPoints: [] }],
    competitors: [
      {
        name: 'Acme Booking',
        category: 'booking SaaS',
        positioning: 'Regulated under the Data Protection Act.',
        strengths: [],
        weaknesses: [],
        confidence: 'unverified',
      },
    ],
    market: {
      demandSignals: [],
      headwinds: ['Must satisfy CCPA and the local Ministry of Commerce.'],
      sizeNote: 'crowded',
      confidence: 'unverified',
    },
    usp: { statement: 'u', differentiators: [], defensibility: '' },
    mvp: { verdict: 'well-scoped', reasoning: '', recommendedCore: [], deferSuggestions: [] },
    verdict: 'proceed',
    verdictRationale: 'A solid fit.',
    researchChecklist: [],
  };

  it('generalizes specifics across market + competitor prose and leaves a checklist note', () => {
    const screened = screenUngroundedSpecifics(base, 'a small booking app');

    expect(screened.market.headwinds.join(' ')).not.toMatch(/CCPA|Ministry of Commerce/);
    expect(screened.competitors[0].positioning).not.toMatch(/Data Protection Act/);
    // The generalization is never silent — the owner is told to confirm the real ones.
    expect(screened.researchChecklist.join(' ')).toMatch(/specific laws, regulators/i);
  });

  it('leaves everything alone when nothing named is present', () => {
    const clean = { ...base, competitors: [], market: { ...base.market, headwinds: ['Crowded space.'] } };
    const screened = screenUngroundedSpecifics(clean, 'a small booking app');
    expect(screened.market.headwinds).toEqual(['Crowded space.']);
    expect(screened.researchChecklist.join(' ')).not.toMatch(/specific laws/i);
  });
});

// ── fact stability across re-runs (pure) ────────────────────────────────────

describe('inputs fingerprint', () => {
  const input = {
    idea: 'A clinic booking app',
    industry: 'healthcare',
    goal: 'book appointments',
    features: ['book', 'remind'],
    slots: { target_market: 'Saudi Arabia' },
  };

  it('is identical for identical inputs and stable across calls', () => {
    expect(businessAnalysisInputsFingerprint(input)).toBe(
      businessAnalysisInputsFingerprint({ ...input }),
    );
  });

  it('changes when a grounding input changes', () => {
    expect(businessAnalysisInputsFingerprint(input)).not.toBe(
      businessAnalysisInputsFingerprint({ ...input, slots: { target_market: 'UAE' } }),
    );
  });
});

describe('carryOverFacts + diff', () => {
  const withCompetitor = (name: string, sizeNote: string): BusinessAnalysis => ({
    sessionId: 's1',
    generatedAt: 'now',
    problem: { problem: 'p', whoHasIt: '', currentAlternative: '', costOfInaction: '' },
    segments: [{ name: 'User', description: '', jobToBeDone: '', painPoints: [] }],
    competitors: [
      { name, category: 'x', positioning: '', strengths: [], weaknesses: [], confidence: 'unverified' },
    ],
    market: { demandSignals: [], headwinds: [], sizeNote, confidence: 'unverified' },
    usp: { statement: 'u', differentiators: [], defensibility: '' },
    mvp: { verdict: 'well-scoped', reasoning: '', recommendedCore: [], deferSuggestions: [] },
    verdict: 'proceed',
    verdictRationale: 'fresh framing',
    researchChecklist: [],
  });

  it('keeps the previous facts and the fresh framing', () => {
    const previous = withCompetitor('Acme', 'crowded');
    const fresh = { ...withCompetitor('Globex', 'nascent'), verdictRationale: 'new angle' };

    const merged = carryOverFacts(fresh, previous);

    expect(merged.competitors.map((c) => c.name)).toEqual(['Acme']); // fact pinned
    expect(merged.market.sizeNote).toBe('crowded'); // fact pinned
    expect(merged.verdictRationale).toBe('new angle'); // framing fresh
  });

  it('reports a stable diff when facts did not move, and names what did', () => {
    const previous = withCompetitor('Acme', 'crowded');
    expect(diffBusinessAnalysisFacts(previous, previous).stable).toBe(true);

    const diff = diffBusinessAnalysisFacts(previous, withCompetitor('Globex', 'nascent'));
    expect(diff.stable).toBe(false);
    expect(diff.competitorsAdded).toEqual(['Globex']);
    expect(diff.competitorsRemoved).toEqual(['Acme']);
    expect(diff.marketSignalsChanged).toBe(true);
  });
});

// ── the service: re-run reuses facts ────────────────────────────────────────

const SUMMARY: RequirementsSummary = {
  goal: 'Let clinics book and track patient appointments.',
  users: ['Receptionist', 'Doctor'],
  features: ['Book appointment', 'Reminders'],
  businessRules: [],
  constraints: [],
  assumptions: [],
};

async function seed(sessions: InMemoryInterviewSessionRepository): Promise<string> {
  const session = {
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
    },
    openQuestions: null,
  } as unknown as InterviewSession;
  await sessions.create(session);
  return session.id;
}

/** A valid model reply (passes the agent's isValid) naming one competitor. */
const reply = (competitor: string) => ({
  problem: {
    problem: 'Clinics book appointments on paper.',
    whoHasIt: 'Receptionists',
    currentAlternative: 'Paper diary',
    costOfInaction: 'Missed appointments',
  },
  segments: [
    { name: 'Receptionist', description: 'Books visits', jobToBeDone: 'Book fast', painPoints: ['slow'] },
  ],
  competitors: [
    {
      name: competitor,
      category: 'booking SaaS',
      positioning: 'General booking tool',
      strengths: ['known'],
      weaknesses: ['generic'],
      confidence: 'unverified',
    },
  ],
  market: { demandSignals: ['clinics digitizing'], headwinds: [], sizeNote: 'fragmented', confidence: 'unverified' },
  usp: { statement: 'Purpose-built for clinics', differentiators: ['reminders'], defensibility: 'workflow depth' },
  mvp: { verdict: 'well-scoped', reasoning: 'sensible', recommendedCore: ['Book'], deferSuggestions: [] },
  verdict: 'proceed',
  verdictRationale: 'Clear problem and cut.',
  researchChecklist: [],
});

function build() {
  const sessions = new InMemoryInterviewSessionRepository();
  const analyses = new InMemoryBusinessAnalysisRepository();
  const llm = new MockLlmProvider();
  const service = new BusinessAnalysisService(sessions, analyses, new BusinessAnalystAgent(llm));
  return { sessions, analyses, llm, service };
}

describe('BusinessAnalysisService re-run pins the facts', () => {
  it('reuses the first run\'s competitors on a plain re-run of the same interview', async () => {
    const { sessions, llm, service } = build();
    const id = await seed(sessions);

    llm.enqueueJson(reply('Acme Booking'));
    const first = await service.generate(id);
    expect(first.competitors.map((c) => c.name)).toEqual(['Acme Booking']);
    expect(first.inputsFingerprint).toBeTruthy();

    // A different competitor comes back, but the inputs are unchanged — the stored
    // fact must win so the client-facing document does not contradict itself.
    llm.enqueueJson(reply('Globex Scheduling'));
    const second = await service.generate(id);
    expect(second.competitors.map((c) => c.name)).toEqual(['Acme Booking']);
  });

  it('re-researches when refreshFacts is set', async () => {
    const { sessions, llm, service } = build();
    const id = await seed(sessions);

    llm.enqueueJson(reply('Acme Booking'));
    await service.generate(id);

    llm.enqueueJson(reply('Globex Scheduling'));
    const refreshed = await service.generate(id, { refreshFacts: true });
    expect(refreshed.competitors.map((c) => c.name)).toEqual(['Globex Scheduling']);
  });
});
