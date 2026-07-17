import {
  defaultExtendedArtifacts,
  EXTENDED_ARTIFACTS_BUDGET_THRESHOLD,
  type SlotMap,
} from '@archivato/shared';
import { InterviewService } from './interview.service';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import { TOTAL_QUESTIONS } from './question-plan';

const IDEA = { idea: 'A clinic booking system with payments and reports' };

const budget = (value: string, na = false): SlotMap => ({
  budget_range: { value, confidence: 'high', source: 'explicit', ...(na ? { na: true } : {}) },
});

function makeService() {
  const repo = new InMemoryInterviewSessionRepository();
  const mock = new MockLlmProvider();
  const service = new InterviewService(
    repo,
    new ProductAnalystAgent(mock),
    new InterviewerAgent(mock),
    undefined as never, // no billing enforcement for owner-less test sessions
  );
  return { service, repo };
}

/**
 * Drive the interview to the confirmation gate, optionally seeding the slots an
 * adaptive turn would have extracted.
 *
 * The slots go on right after `start()` because the default is derived when
 * `advance()` closes the gate — they have to be there before that, exactly as
 * they would be in a real run. (Plan mode extracts no slots of its own and
 * `advance()` only merges when a turn returns some, so a seeded snapshot
 * survives.)
 */
async function toGate(
  service: InterviewService,
  repo: InMemoryInterviewSessionRepository,
  slots?: SlotMap,
): Promise<string> {
  const { sessionId } = await service.start(IDEA);
  if (slots) {
    const session = await repo.findById(sessionId);
    await repo.save({ ...session!, slots });
  }
  for (let i = 0; i < TOTAL_QUESTIONS; i++) {
    const state = await service.getState(sessionId);
    if (state.status !== 'collecting') break;
    await service.answer(sessionId, 'payments and reports');
  }
  return sessionId;
}

// ── the pure default rule ───────────────────────────────────────────────────

describe('defaultExtendedArtifacts', () => {
  it('defaults OFF for a budget under the threshold', () => {
    expect(defaultExtendedArtifacts(budget('$4,000'))).toBe(false);
    expect(defaultExtendedArtifacts(budget('5k'))).toBe(false);
  });

  it('defaults ON for a budget over the threshold', () => {
    expect(defaultExtendedArtifacts(budget('$40,000'))).toBe(true);
    expect(defaultExtendedArtifacts(budget('60k'))).toBe(true);
  });

  it('reads the TOP of a range — a budget that can stretch, does', () => {
    // 5,000–12,000 straddles the threshold. The ceiling is what the project can
    // afford, so it defaults on.
    expect(defaultExtendedArtifacts(budget('5000-12000'))).toBe(true);
  });

  it('treats exactly the threshold as small', () => {
    expect(
      defaultExtendedArtifacts(budget(`$${EXTENDED_ARTIFACTS_BUDGET_THRESHOLD}`)),
    ).toBe(false);
  });

  it('defaults ON when the budget is unknown, unparseable, or n/a', () => {
    // "Unknown means yes": never withhold a security analysis on a failed parse.
    expect(defaultExtendedArtifacts({})).toBe(true);
    expect(defaultExtendedArtifacts(null)).toBe(true);
    expect(defaultExtendedArtifacts(undefined)).toBe(true);
    expect(defaultExtendedArtifacts(budget('we will discuss later'))).toBe(true);
    // `na` means "irrelevant for this project", NOT "the budget is small".
    expect(defaultExtendedArtifacts(budget('$4,000', true))).toBe(true);
  });

  it('reads Arabic numerals, like parseBudget does', () => {
    expect(defaultExtendedArtifacts(budget('٤٠٠٠ دولار'))).toBe(false);
    expect(defaultExtendedArtifacts(budget('٥٠٠٠٠ دولار'))).toBe(true);
  });
});

// ── the setting on a session ────────────────────────────────────────────────

describe('generateExtendedArtifacts on a new project', () => {
  it('stores null ("not decided") and reads as ON before any budget is known', async () => {
    const { service, repo } = makeService();
    const { sessionId } = await service.start(IDEA);

    // The stored marker stays null so the default keeps tracking the budget…
    expect((await repo.findById(sessionId))!.generateExtendedArtifacts).toBeNull();
    // …while the projection resolves it for the client.
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);
  });

  it('tracks a budget corrected at the gate, until the owner decides', async () => {
    // The bug this guards: the default used to be computed once and written at the
    // gate, so correcting `budget_range` in the slot editor — directly above the
    // toggle — could not move it.
    const { service, repo } = makeService();
    const sessionId = await toGate(service, repo);
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);

    // The owner corrects the budget at the gate to a small one.
    await service.editSlot(sessionId, 'budget_range', '$3,000');
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(false);

    // Now they decide explicitly — from here the slot can't overrule them.
    await service.update(sessionId, { generateExtendedArtifacts: true });
    await service.editSlot(sessionId, 'budget_range', '$2,000');
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);
  });

  it('pins the resolved value on confirm', async () => {
    const { service, repo } = makeService();
    const sessionId = await toGate(service, repo, budget('$4,000'));
    expect((await repo.findById(sessionId))!.generateExtendedArtifacts).toBeNull();

    await service.confirm(sessionId);

    // A confirmed project carries an explicit answer rather than one that depends
    // on re-parsing a sentence later.
    expect((await repo.findById(sessionId))!.generateExtendedArtifacts).toBe(false);
  });

  it('derives OFF from a small budget at the gate', async () => {
    const { service, repo } = makeService();
    const sessionId = await toGate(service, repo, budget('$4,000'));

    const state = await service.getState(sessionId);
    expect(state.status).toBe('awaiting_confirmation');
    expect(state.generateExtendedArtifacts).toBe(false);
  });

  it('derives ON from a large budget at the gate', async () => {
    const { service, repo } = makeService();
    const sessionId = await toGate(service, repo, budget('$80,000'));

    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);
  });

  it('respects the owner override, and never re-derives over it', async () => {
    const { service, repo } = makeService();
    const sessionId = await toGate(service, repo, budget('$4,000'));
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(false);

    // The owner ticks the box at the gate.
    await service.update(sessionId, { generateExtendedArtifacts: true });
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);

    // Confirming must not re-derive it back to false from the small budget —
    // `advance()` is what derives, and it can't run again once past the gate.
    await service.confirm(sessionId);
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);
  });

  it('leaves the setting alone when the patch omits it', async () => {
    const { service, repo } = makeService();
    const sessionId = await toGate(service, repo);
    await service.update(sessionId, { generateExtendedArtifacts: false });

    // Renaming must not silently switch the artifacts back on — the same
    // omitted-means-untouched rule the other fields follow.
    await service.update(sessionId, { title: 'Clinic bid' });
    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(false);
  });

  it('is exposed on the project summary for the dashboard', async () => {
    const { service, repo } = makeService();
    const { sessionId } = await service.start(IDEA);
    const session = await repo.findById(sessionId);
    await repo.save({ ...session!, userId: 'u1' });

    const summary = await service.update(sessionId, {
      generateExtendedArtifacts: false,
    });
    expect(summary.generateExtendedArtifacts).toBe(false);
  });
});

// ── existing projects ───────────────────────────────────────────────────────

describe('existing projects', () => {
  it('are unaffected — a pre-R12 row was backfilled to an explicit ON', async () => {
    const { service, repo } = makeService();
    const { sessionId } = await service.start(IDEA);

    // How a pre-R12 row looks after the migrations: the first added the column
    // NOT NULL DEFAULT true (backfilling every existing row to an explicit `true`),
    // the second only made it nullable for new rows. So an old project carries a
    // real `true`, not a derivation…
    const session = await repo.findById(sessionId);
    await repo.save({
      ...session!,
      generateExtendedArtifacts: true,
      slots: budget('$500'), // …and a tiny budget cannot take its stages away.
    });

    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);
  });
});
