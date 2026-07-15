import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { COMPLETENESS_THRESHOLD, type IntentAnalysis } from '@archivato/shared';
import { InterviewService } from './interview.service';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type { BillingService } from '../billing/billing.service';
import { TOTAL_QUESTIONS } from './question-plan';

// These tests drive the state machine with owner-less sessions (userId = null),
// so the confirm gate never calls billing — a no-op stub satisfies the type.
const billingStub = {
  getProjectQuota: async () => 999,
} as unknown as BillingService;

function makeService(mock = new MockLlmProvider()): InterviewService {
  const repo = new InMemoryInterviewSessionRepository();
  const analyst = new ProductAnalystAgent(mock);
  return new InterviewService(
    repo,
    analyst,
    new InterviewerAgent(mock),
    billingStub,
  );
}

const IDEA = { idea: 'A clinic management system with appointments and billing' };

async function answerAll(svc: InterviewService, sessionId: string) {
  // Answer until the gate closes collecting.
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await svc.getState(sessionId);
    if (state.status !== 'collecting') break;
    await svc.answer(sessionId, `answer-${i}`);
  }
}

describe('InterviewService', () => {
  it('starts collecting and asks the first Understanding question', async () => {
    const svc = makeService();
    const state = await svc.start(IDEA);

    expect(state.status).toBe('collecting');
    expect(state.completeness).toBe(0);
    expect(state.currentQuestion?.id).toBe('a1');
    expect(state.phase).toBe('understanding');
    expect(state.summary).toBeNull();
  });

  it('uses a deterministic fallback intent when the provider echoes', async () => {
    const svc = makeService(); // default mock echoes -> invalid IntentAnalysis
    const state = await svc.start(IDEA);
    expect(state.intent?.summary).toBe(IDEA.idea);
  });

  it('uses the agent intent when the provider returns valid analysis', async () => {
    const mock = new MockLlmProvider();
    const intent: IntentAnalysis = {
      summary: 'Clinic management platform',
      domain: 'healthcare',
      primaryUsers: ['doctors', 'patients'],
      coreCapabilities: ['appointments', 'billing'],
      openQuestions: [],
    };
    mock.enqueueJson(intent);

    const svc = makeService(mock);
    const state = await svc.start(IDEA);
    expect(state.intent).toEqual(intent);
  });

  it('advances through questions and tracks completeness', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);

    const afterOne = await svc.answer(sessionId, 'manage a clinic');
    expect(afterOne.history).toHaveLength(1);
    expect(afterOne.currentQuestion?.id).toBe('a2');
    expect(afterOne.completeness).toBeGreaterThan(0);
  });

  it('reaches the gate, summarizes, and awaits confirmation', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);
    await answerAll(svc, sessionId);

    const state = await svc.getState(sessionId);
    expect(state.status).toBe('awaiting_confirmation');
    expect(state.completeness).toBeGreaterThanOrEqual(COMPLETENESS_THRESHOLD);
    expect(state.currentQuestion).toBeNull();
    expect(state.summary).not.toBeNull();
    expect(state.summary?.goal).toBeTruthy();
  });

  it('rejects answering once the gate is reached', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);
    await answerAll(svc, sessionId);

    await expect(svc.answer(sessionId, 'late answer')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('confirms only from the awaiting_confirmation state', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);

    await expect(svc.confirm(sessionId)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await answerAll(svc, sessionId);
    const confirmed = await svc.confirm(sessionId);
    expect(confirmed.status).toBe('confirmed');
  });

  it('throws NotFound for an unknown session', async () => {
    const svc = makeService();
    await expect(svc.getState('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ── ownership / "my projects" ─────────────────────────────────────────────

  it('stamps the owner on start and lists only that user\'s projects', async () => {
    const svc = makeService();
    await svc.start(IDEA, 'user-1');
    await svc.start({ idea: 'A second unrelated project idea' }, 'user-1');
    await svc.start({ idea: 'Someone else entirely owns this one' }, 'user-2');

    const mine = await svc.list('user-1');
    expect(mine).toHaveLength(2);
    expect(mine.every((p) => typeof p.sessionId === 'string')).toBe(true);
    expect(mine[0]).toHaveProperty('status', 'collecting');

    const theirs = await svc.list('user-2');
    expect(theirs).toHaveLength(1);

    expect(await svc.list('nobody')).toEqual([]);
  });

  it('renames a project (title falls back to idea, blank clears it)', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA, 'user-1');

    // No title initially → summary omits it (UI falls back to the idea).
    expect((await svc.list('user-1'))[0].title).toBeUndefined();

    const renamed = await svc.update(sessionId, { title: '  Clinic Platform  ' });
    expect(renamed.title).toBe('Clinic Platform'); // trimmed
    expect((await svc.list('user-1'))[0].title).toBe('Clinic Platform');

    // Blank title clears it.
    const cleared = await svc.update(sessionId, { title: '   ' });
    expect(cleared.title).toBeUndefined();
  });

  it('records the client a scoping is for, without touching the idea', async () => {
    const svc = makeService();
    await svc.start(IDEA, 'user-1', '  Acme Clinics  ');

    const [project] = await svc.list('user-1');
    expect(project.clientName).toBe('Acme Clinics'); // trimmed
    // The client's name is a label for the owner — it must never become part of
    // the idea, which is what the agents read and what the share page echoes.
    expect(project.idea).toBe(IDEA.idea);
    expect(project.idea).not.toContain('Acme');
  });

  // A patch is partial: renaming a project must not wipe the client it's for
  // (and vice versa) — only a field that is actually sent gets written.
  it('patches title and clientName independently', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA, 'user-1', 'Acme Clinics');

    const renamed = await svc.update(sessionId, { title: 'Clinic OS' });
    expect(renamed.title).toBe('Clinic OS');
    expect(renamed.clientName).toBe('Acme Clinics'); // untouched

    const recliented = await svc.update(sessionId, { clientName: 'Beta Health' });
    expect(recliented.title).toBe('Clinic OS'); // untouched
    expect(recliented.clientName).toBe('Beta Health');

    // Blank clears just that field.
    const cleared = await svc.update(sessionId, { clientName: '' });
    expect(cleared.clientName).toBeUndefined();
    expect(cleared.title).toBe('Clinic OS');
  });

  it('enforces the project-count quota at start (402 past the limit)', async () => {
    const mock = new MockLlmProvider();
    const repo = new InMemoryInterviewSessionRepository();
    // Stub a plan that allows exactly 1 project.
    const billing = { getProjectQuota: async () => 1 } as unknown as BillingService;
    const svc = new InterviewService(
      repo,
      new ProductAnalystAgent(mock),
      new InterviewerAgent(mock),
      billing,
    );
    await svc.start(IDEA, 'user-1');
    await expect(
      svc.start({ idea: 'A second project over the limit' }, 'user-1'),
    ).rejects.toBeInstanceOf(HttpException);
    // A different user is unaffected.
    await expect(svc.start(IDEA, 'user-2')).resolves.toBeDefined();
  });

  it('deletes a project (frees a quota slot)', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA, 'user-1');
    await svc.deleteProject(sessionId);
    await expect(svc.getState(sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(await svc.list('user-1')).toHaveLength(0);
  });

  // ── adaptive interview (real-AI path, scripted via the mock) ──────────────

  /** A mock that answers the interviewer with scripted, adaptive decisions. */
  function adaptiveMock(): MockLlmProvider {
    const mock = new MockLlmProvider();
    let turn = 0;
    mock.setResponder((messages) => {
      const text = messages.map((m) => m.content).join('\n');
      // The interviewer prompt asks for the "NEXT question"; everything else
      // (intent analysis) just echoes and uses its deterministic fallback.
      if (!text.includes('NEXT question')) {
        return JSON.stringify({ provider: 'mock', echo: 'intent' });
      }
      turn += 1;
      // Finish once at least 4 questions have been answered (turn 5).
      if (turn >= 5) {
        return JSON.stringify({ done: true, coverage: 0.95 });
      }
      return JSON.stringify({
        done: false,
        coverage: 0.2 * turn,
        phase: 'features',
        question: `Adaptive question ${turn}?`,
      });
    });
    return mock;
  }

  it('asks AI-generated questions when the interview provider conforms', async () => {
    const svc = makeService(adaptiveMock());
    const state = await svc.start(IDEA);

    expect(state.currentQuestion?.id).toBe('q1');
    expect(state.currentQuestion?.prompt).toBe('Adaptive question 1?');
    expect(state.currentQuestion?.phase).toBe('features');
    // Coverage reflects the model's estimate, not a fixed plan ratio.
    expect(state.completeness).toBeCloseTo(0.2);
  });

  it('closes the gate when the AI signals it has enough', async () => {
    const svc = makeService(adaptiveMock());
    const { sessionId } = await svc.start(IDEA);

    // Answer the 4 adaptive questions; the 5th decision is done=true.
    for (let i = 0; i < 6; i++) {
      const s = await svc.getState(sessionId);
      if (s.status !== 'collecting') break;
      await svc.answer(sessionId, `answer ${i}`);
    }

    const state = await svc.getState(sessionId);
    expect(state.status).toBe('awaiting_confirmation');
    expect(state.history).toHaveLength(4);
    expect(state.completeness).toBeGreaterThanOrEqual(COMPLETENESS_THRESHOLD);
    expect(state.currentQuestion).toBeNull();
    expect(state.summary).not.toBeNull();
  });

  it('falls back to the fixed plan when the provider is non-conforming', async () => {
    const svc = makeService(); // default echo → invalid decision → plan
    const state = await svc.start(IDEA);
    expect(state.currentQuestion?.id).toBe('a1');
  });

  it('on a mid-interview fallback, continues forward and keeps coverage', async () => {
    const mock = new MockLlmProvider();
    let turn = 0;
    mock.setResponder((messages) => {
      const text = messages.map((m) => m.content).join('\n');
      if (!text.includes('NEXT question')) {
        return JSON.stringify({ provider: 'mock' }); // intent → fallback
      }
      turn += 1;
      if (turn <= 2) {
        return JSON.stringify({
          done: false,
          coverage: 0.5,
          phase: 'features',
          question: `Q${turn}?`,
        });
      }
      return 'not json'; // 3rd turn fails → plan fallback
    });

    const svc = makeService(mock);
    const { sessionId } = await svc.start(sessionIdea());
    await svc.answer(sessionId, 'a'); // → Q2?
    const s = await svc.answer(sessionId, 'b'); // adaptive fails → plan fallback

    // Did NOT restart at the first plan question…
    expect(s.currentQuestion?.id).not.toBe('a1');
    // …picked the next plan question by position (a1, a2, [b1])…
    expect(s.currentQuestion?.id).toBe('b1');
    // …and coverage did not drop back to the length ratio (2/11 ≈ 0.18).
    expect(s.completeness).toBe(0.5);
  });

  // ── R6: slot-filling scoping interview ────────────────────────────────────

  /** A mock that scripts interviewer turns (intent analysis just echoes). */
  function scriptedInterview(
    turns: Record<string, unknown>[],
  ): MockLlmProvider {
    const mock = new MockLlmProvider();
    let turn = 0;
    mock.setResponder((messages) => {
      const text = messages.map((m) => m.content).join('\n');
      if (!text.includes('NEXT question')) {
        return JSON.stringify({ provider: 'mock' }); // intent → fallback
      }
      const decision = turns[Math.min(turn, turns.length - 1)];
      turn += 1;
      return JSON.stringify(decision);
    });
    return mock;
  }

  it('notes-first: seeds the transcript with the notes and continues the plan from position 1', async () => {
    const svc = makeService(); // echo → plan fallback (no slots in plan mode)
    const state = await svc.start(
      IDEA,
      null,
      null,
      'Client wants a booking app. Budget ~$15k, needs it in about 2 months.',
    );

    // The notes are the first transcript entry, labelled as call notes.
    expect(state.history).toHaveLength(1);
    expect(state.history[0].question.id).toBe('call-notes');
    expect(state.history[0].answer).toContain('booking app');
    // The linear plan continues from position 1 (a2), not a1.
    expect(state.currentQuestion?.id).toBe('a2');
    // Plan mode fills no slots — downstream tolerates that.
    expect(state.slots).toEqual({});
    expect(state.openQuestions).toEqual([]);
  });

  it("records an unknown answer as a client question and does NOT re-ask it", async () => {
    const svc = makeService(
      scriptedInterview([
        {
          done: false,
          coverage: 0.3,
          phase: 'commercial',
          question: 'What budget does the client have in mind?',
        },
        {
          done: false,
          coverage: 0.5,
          phase: 'business_logic',
          question: 'Which core workflows matter most?',
          openQuestions: [
            {
              slotKey: 'budget_range',
              questionForClient: 'What budget do you have in mind for this?',
            },
          ],
        },
      ]),
    );
    const { sessionId } = await svc.start(IDEA);

    const asked = await svc.getState(sessionId);
    expect(asked.currentQuestion?.prompt).toContain('budget');

    // The owner hasn't discussed budget with their client yet.
    const next = await svc.answer(
      sessionId,
      "I don't know — haven't discussed it with the client yet.",
    );

    // It's recorded to forward to the client…
    expect(next.openQuestions.map((q) => q.slotKey)).toContain('budget_range');
    // …and the interview moves on rather than re-asking about budget.
    expect(next.currentQuestion?.prompt).toContain('workflows');
    expect(next.currentQuestion?.prompt).not.toContain('budget');
  });

  it('exposes filled slots + open questions on the confirmation payload', async () => {
    const svc = makeService(
      scriptedInterview([
        {
          done: false,
          coverage: 0.3,
          phase: 'understanding',
          question: 'Who are the users?',
          slots: {
            business_domain: {
              value: 'clinic booking',
              confidence: 'high',
              source: 'explicit',
            },
          },
        },
        { done: false, coverage: 0.5, phase: 'features', question: 'Workflows?' },
        { done: false, coverage: 0.7, phase: 'scale', question: 'Scale?' },
        {
          done: true,
          coverage: 0.95,
          slots: {
            timeline: { value: '~2 months', confidence: 'low', source: 'inferred' },
          },
          openQuestions: [
            { slotKey: 'budget_range', questionForClient: 'What is the budget?' },
          ],
        },
      ]),
    );
    const { sessionId } = await svc.start(IDEA);
    for (let i = 0; i < 6; i++) {
      const s = await svc.getState(sessionId);
      if (s.status !== 'collecting') break;
      await svc.answer(sessionId, `answer ${i}`);
    }

    const state = await svc.getState(sessionId);
    expect(state.status).toBe('awaiting_confirmation');
    // Slots accumulated across turns (explicit + a final inferred one).
    expect(state.slots.business_domain?.value).toBe('clinic booking');
    expect(state.slots.timeline?.source).toBe('inferred');
    // The unanswered gap is on the confirmation payload for the client.
    expect(state.openQuestions.map((q) => q.slotKey)).toContain('budget_range');
  });

  it('editSlot appends a correction to the transcript and marks the slot explicit', async () => {
    const svc = makeService(); // plan mode — no slots to start
    const { sessionId } = await svc.start(IDEA);
    await answerAll(svc, sessionId);
    const before = await svc.getState(sessionId);
    expect(before.status).toBe('awaiting_confirmation');
    const historyLen = before.history.length;

    const after = await svc.editSlot(sessionId, 'budget_range', '  $12k  ');

    // The snapshot reflects the correction as an explicit, high-confidence value.
    expect(after.slots.budget_range).toEqual({
      value: '$12k',
      confidence: 'high',
      source: 'explicit',
    });
    // The transcript — the source of truth — grew by exactly one correction turn.
    expect(after.history).toHaveLength(historyLen + 1);
    const correction = after.history[after.history.length - 1];
    expect(correction.question.id).toBe('correction:budget_range');
    expect(correction.answer).toBe('$12k');
  });

  it('editSlot rejects an unknown slot, and a locked (confirmed) session', async () => {
    const svc = makeService();
    const { sessionId } = await svc.start(IDEA);
    await answerAll(svc, sessionId);

    await expect(
      svc.editSlot(sessionId, 'not_a_slot', 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);

    await svc.confirm(sessionId);
    await expect(
      svc.editSlot(sessionId, 'budget_range', '$5k'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

/** A fresh idea object (avoids sharing the module-level IDEA across mutations). */
function sessionIdea() {
  return { idea: 'A clinic management system with appointments and billing' };
}
