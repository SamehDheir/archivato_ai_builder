import { InterviewService } from './interview.service';
import { InMemoryInterviewSessionRepository } from './in-memory-interview-session.repository';
import { ProductAnalystAgent } from '../llm/agents/product-analyst.agent';
import { InterviewerAgent } from '../llm/agents/interviewer.agent';
import { MockLlmProvider } from '../llm/mock-llm.provider';
import type {
  LlmCompleteOptions,
  LlmMessage,
  LlmProvider,
} from '../llm/llm-provider.interface';
import type { BillingService } from '../billing/billing.service';

const billingStub = {
  getProjectQuota: async () => 999,
} as unknown as BillingService;

/**
 * One turn of the adaptive interview, as the real interviewer model produces it.
 *
 * The `phase` labels here are the crux of the bug this pins. The adaptive
 * interviewer picks questions to fill SLOTS, and tags each with a free-text phase
 * after the fact — so several unrelated questions land under "understanding" and
 * the "features" phase is never used at all. The old summary bucketed the
 * transcript by that label, which turned every Understanding answer after the
 * first into a user ROLE and left the feature list empty.
 */
const TURNS = [
  {
    phase: 'understanding',
    question: 'What industry is this for?',
    slots: {
      business_domain: {
        value: "Fashion e-commerce — women's clothing",
        confidence: 'high',
        source: 'explicit',
      },
    },
  },
  {
    phase: 'understanding',
    question: 'Who will use the system?',
    slots: {
      target_users_roles: {
        value: 'Admin/Owner, Customer Service, Shipping Staff',
        confidence: 'high',
        source: 'explicit',
      },
    },
  },
  {
    phase: 'understanding',
    question: 'Walk me through the main flows.',
    slots: {
      core_workflows: {
        value:
          '1. Customer places an order and pays cash on delivery. 2. Inventory decrements on confirmation. 3. WhatsApp notification on each status change.',
        confidence: 'high',
        source: 'explicit',
      },
    },
  },
  {
    phase: 'understanding',
    question: 'What does it need to keep track of?',
    slots: {
      data_entities: {
        value: 'Product, Order, Inventory Log',
        confidence: 'high',
        source: 'explicit',
      },
    },
  },
  {
    phase: 'understanding',
    question: 'Which region does it serve?',
    slots: {
      target_market: {
        value: 'Palestine (Gaza/West Bank)',
        confidence: 'high',
        source: 'explicit',
      },
    },
  },
];

/** A provider that plays the scripted adaptive interview, then finishes. */
class ScriptedInterviewProvider implements LlmProvider {
  readonly name = 'scripted';
  readonly defaultModel = 'scripted-model';
  private turn = 0;

  async complete(): Promise<string> {
    return '';
  }

  async completeJson<T>(
    _messages: LlmMessage[],
    _options?: LlmCompleteOptions,
  ): Promise<T> {
    const next = TURNS[this.turn];
    this.turn += 1;
    if (!next) {
      return { done: true, coverage: 1 } as unknown as T;
    }
    return {
      done: false,
      coverage: Math.min(0.2 * this.turn, 0.95),
      ...next,
    } as unknown as T;
  }
}

function makeService(): InterviewService {
  return new InterviewService(
    new InMemoryInterviewSessionRepository(),
    // The analyst runs on the echo mock so intent falls back deterministically —
    // only the interviewer needs to be scripted here.
    new ProductAnalystAgent(new MockLlmProvider()),
    new InterviewerAgent(new ScriptedInterviewProvider()),
    billingStub,
  );
}

describe('adaptive interview → requirements summary', () => {
  async function runInterview() {
    const svc = makeService();
    const { sessionId } = await svc.start({
      idea: "An online store for a women's clothing boutique",
    });

    for (let i = 0; i < TURNS.length + 2; i++) {
      const state = await svc.getState(sessionId);
      if (state.status !== 'collecting') break;
      await svc.answer(sessionId, `answer to: ${state.currentQuestion?.prompt}`);
    }
    return (await svc.getState(sessionId)).summary!;
  }

  it('takes user roles from the roles slot, not from the phase bucket', async () => {
    const summary = await runInterview();

    expect(summary.users).toEqual([
      'Admin/Owner',
      'Customer Service',
      'Shipping Staff',
    ]);
  });

  it('never promotes another answer into the roles list', async () => {
    const summary = await runInterview();
    const joined = summary.users.join(' | ');

    // Every one of these was reported as a "role" in the original document.
    expect(joined).not.toMatch(/Palestine/i);
    expect(joined).not.toMatch(/Inventory Log/i);
    expect(joined).not.toMatch(/answer to:/i);
    expect(joined).not.toMatch(/industry/i);
  });

  it('fills features from the workflow slot even though no question was labelled "features"', async () => {
    const summary = await runInterview();

    expect(summary.features.length).toBeGreaterThanOrEqual(3);
    expect(summary.features.join(' ')).toMatch(/inventory/i);
    expect(summary.features.join(' ')).toMatch(/whatsapp/i);
  });

  it('does not use the first adaptive answer as the project goal', async () => {
    const summary = await runInterview();

    expect(summary.goal).not.toMatch(/^answer to:/);
    expect(summary.goal.length).toBeGreaterThan(0);
  });
});
