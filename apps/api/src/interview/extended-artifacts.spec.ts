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
  it('starts ON before the gate, since no budget is known yet', async () => {
    const { service, repo } = makeService();
    const { sessionId } = await service.start(IDEA);
    expect((await repo.findById(sessionId))!.generateExtendedArtifacts).toBe(true);
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
  it('are unaffected — an unset flag reads as ON', async () => {
    const { service, repo } = makeService();
    const { sessionId } = await service.start(IDEA);

    // A row created before R12: the column's NOT NULL DEFAULT true is what
    // backfills it, so a session that never saw the setting keeps every stage.
    const session = await repo.findById(sessionId);
    await repo.save({
      ...session!,
      generateExtendedArtifacts: true,
    });

    expect((await service.getState(sessionId)).generateExtendedArtifacts).toBe(true);
  });
});
