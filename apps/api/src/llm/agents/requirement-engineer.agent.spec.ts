import type {
  IntentAnalysis,
  OpenQuestion,
  RequirementDocument,
  RequirementsSummary,
  SlotMap,
} from '@archivato/shared';
import { RequirementEngineerAgent } from './requirement-engineer.agent';
import { MockLlmProvider } from '../mock-llm.provider';
import type { RequirementContext } from './requirement-engineer.agent';

const SUMMARY: RequirementsSummary = {
  goal: 'let customers book home-cleaning visits and pay online',
  users: ['Customer', 'Provider', 'Admin'],
  features: [
    'Browse services and providers',
    'Book an available time slot',
    'Pay securely at booking',
  ],
  businessRules: ['A slot can hold only one active booking.'],
  constraints: ['Web-first launch.'],
  assumptions: ['Providers are independent contractors.'],
};

const INTENT: IntentAnalysis = {
  summary: 'Home-services booking marketplace.',
  domain: 'booking/reservations',
  primaryUsers: ['Customer', 'Provider'],
  coreCapabilities: ['booking', 'payments'],
  openQuestions: [],
};

const OPEN_QUESTIONS: OpenQuestion[] = [
  { slotKey: 'integrations', questionForClient: 'Which payment provider should we use?' },
  {
    slotKey: 'scale_expectations',
    questionForClient: 'How many bookings per month do you expect?',
  },
];

// budget_range + timeline are filled here on purpose: they are context only and
// their VALUES must never surface in the requirement document.
const SLOTS: SlotMap = {
  business_domain: { value: 'home services', confidence: 'high', source: 'explicit' },
  target_users_roles: {
    value: 'homeowners and independent providers',
    confidence: 'high',
    source: 'explicit',
  },
  budget_range: { value: '$50,000 USD', confidence: 'high', source: 'explicit' },
  timeline: { value: '3 months', confidence: 'high', source: 'explicit' },
};

function ctx(overrides: Partial<RequirementContext> = {}): RequirementContext {
  return {
    idea: 'A home-services booking marketplace',
    intent: INTENT,
    history: [],
    summary: SUMMARY,
    slots: SLOTS,
    openQuestions: OPEN_QUESTIONS,
    ...overrides,
  };
}

const oqText = (doc: RequirementDocument): string =>
  (doc.assumptionsAndOpenQuestions ?? []).map((a) => a.assumption).join('\n');

describe('RequirementEngineerAgent', () => {
  describe('deterministic fallback (offline)', () => {
    it('emits every new client-facing section', async () => {
      const agent = new RequirementEngineerAgent(new MockLlmProvider());
      const doc = await agent.generate('s1', ctx());

      expect(typeof doc.executiveSummary).toBe('string');
      expect(doc.executiveSummary!.length).toBeGreaterThan(0);
      expect(doc.outOfScope?.length).toBeGreaterThan(0);
      expect(doc.outOfScope![0].item.length).toBeGreaterThan(0);
      expect(doc.assumptionsAndOpenQuestions?.length).toBeGreaterThan(0);
    });

    it('folds the interview open questions into assumptionsAndOpenQuestions', async () => {
      const agent = new RequirementEngineerAgent(new MockLlmProvider());
      const doc = await agent.generate('s1', ctx());

      const text = oqText(doc);
      expect(text).toContain('Which payment provider should we use?');
      expect(text).toContain('How many bookings per month do you expect?');
    });

    it('keeps the functional requirement ids stable (traceability)', async () => {
      const agent = new RequirementEngineerAgent(new MockLlmProvider());
      const doc = await agent.generate('s1', ctx());

      expect(doc.functional.map((f) => f.id)).toEqual(['FR-1', 'FR-2', 'FR-3']);
    });

    it('never leaks the budget or timeline slot values into the document', async () => {
      const agent = new RequirementEngineerAgent(new MockLlmProvider());
      const doc = await agent.generate('s1', ctx());

      const json = JSON.stringify(doc);
      expect(json).not.toContain('$50,000');
      expect(json).not.toContain('3 months');
    });

    it('tolerates an absent slot map (pure plan-mode run)', async () => {
      const agent = new RequirementEngineerAgent(new MockLlmProvider());
      const doc = await agent.generate('s1', ctx({ slots: undefined, openQuestions: [] }));

      expect(doc.executiveSummary!.length).toBeGreaterThan(0);
      expect(doc.outOfScope?.length).toBeGreaterThan(0);
    });
  });

  describe('LLM path normalization', () => {
    const baseLlmDoc = (): Partial<RequirementDocument> => ({
      functional: [
        {
          id: 'FR-1',
          title: 'Book a slot',
          description: 'Customers can book an available slot.',
          priority: 'must',
        },
        {
          id: 'FR-2',
          title: 'Pay online',
          description: 'Customers can pay securely at booking.',
          priority: 'must',
        },
      ],
      nonFunctional: [{ id: 'NFR-1', category: 'security', description: 'TLS everywhere.' }],
      roles: [{ name: 'Customer', description: 'Books and pays.', permissions: ['booking:create'] }],
      businessRules: [{ id: 'BR-1', description: 'One booking per slot.' }],
      constraints: ['Web-first.'],
      assumptions: ['Providers are contractors.'],
    });

    it('backfills the R7 sections and folds in open questions when the model omits them', async () => {
      const mock = new MockLlmProvider();
      mock.enqueueJson(baseLlmDoc());
      const agent = new RequirementEngineerAgent(mock);
      const doc = await agent.generate('s1', ctx());

      // The model's ids survive untouched (traceability).
      expect(doc.functional.map((f) => f.id)).toEqual(['FR-1', 'FR-2']);
      // Missing narrative sections are backfilled deterministically.
      expect(doc.executiveSummary!.length).toBeGreaterThan(0);
      expect(doc.outOfScope?.length).toBeGreaterThan(0);
      // Interview open questions appear even though the model provided none.
      expect(oqText(doc)).toContain('Which payment provider should we use?');
    });

    it('coerces businessRules/constraints to arrays when a valid doc omits them', async () => {
      const mock = new MockLlmProvider();
      // Passes isValid (functional/nonFunctional/roles present) but omits
      // businessRules + constraints — these must not persist as `undefined`.
      const partial = baseLlmDoc();
      delete partial.businessRules;
      delete partial.constraints;
      mock.enqueueJson(partial);
      const agent = new RequirementEngineerAgent(mock);
      const doc = await agent.generate('s1', ctx());

      expect(Array.isArray(doc.businessRules)).toBe(true);
      expect(Array.isArray(doc.constraints)).toBe(true);
    });

    it('keeps the model’s own sections and still appends the interview open questions', async () => {
      const mock = new MockLlmProvider();
      mock.enqueueJson({
        ...baseLlmDoc(),
        executiveSummary: 'A clear client-facing summary of the product.',
        outOfScope: [{ item: 'Native mobile apps', reason: 'web-first at launch' }],
        assumptionsAndOpenQuestions: [
          { assumption: 'Users are on modern browsers.', impactIfWrong: 'Older browsers need polyfills.' },
        ],
      });
      const agent = new RequirementEngineerAgent(mock);
      const doc = await agent.generate('s1', ctx());

      expect(doc.executiveSummary).toBe('A clear client-facing summary of the product.');
      expect(doc.outOfScope).toEqual([
        { item: 'Native mobile apps', reason: 'web-first at launch' },
      ]);
      const text = oqText(doc);
      expect(text).toContain('Users are on modern browsers.');
      expect(text).toContain('Which payment provider should we use?');
    });
  });
});
