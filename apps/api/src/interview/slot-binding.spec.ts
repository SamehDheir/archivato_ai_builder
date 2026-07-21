import {
  InterviewPhase,
  isPlanModeTranscript,
  stripMarkupArtifacts,
  NOTES_ENTRY_ID,
  type InterviewExchange,
  type SlotMap,
} from '@archivato/shared';
import { bindAnswerToSlot } from './slots';

/**
 * The scoping pipeline reads the SLOT SNAPSHOT, never the transcript — the
 * summary's features/constraints, and every regional guard via `target_market`.
 * Extraction is a model behaviour that fails non-deterministically, so an
 * unfilled slot silently erased an answer the interviewer had specifically asked
 * for. These pin the code-level backstop.
 */

const turn = (
  id: string,
  answer: string,
  targetSlot?: InterviewExchange['question']['targetSlot'],
): InterviewExchange => ({
  question: {
    id,
    phase: InterviewPhase.Understanding,
    prompt: 'Q?',
    ...(targetSlot ? { targetSlot } : {}),
  },
  answer,
});

describe('bindAnswerToSlot', () => {
  it('binds the answer when the model skipped the slot it had just asked about', () => {
    const history = [turn('q1', 'The United States and the EU.', 'target_market')];

    const slots = bindAnswerToSlot(history, undefined);

    expect(slots?.target_market).toEqual({
      value: 'The United States and the EU.',
      confidence: 'low',
      source: 'explicit',
    });
  });

  /**
   * The model's own extraction is a *reading*; this is a raw binding. Letting the
   * backstop win would turn a parsed value back into prose.
   */
  it('never overwrites a slot the model did extract', () => {
    const history = [turn('q1', 'We serve the whole Gulf region, mainly the UAE.', 'target_market')];
    const extracted: SlotMap = {
      target_market: { value: 'UAE', confidence: 'high', source: 'explicit' },
    };

    expect(bindAnswerToSlot(history, extracted)?.target_market?.value).toBe('UAE');
  });

  it('leaves the other slots the model extracted alone', () => {
    const history = [turn('q1', 'Patients book, doctors confirm.', 'core_workflows')];
    const extracted: SlotMap = {
      business_domain: { value: 'healthcare', confidence: 'high', source: 'explicit' },
    };

    const slots = bindAnswerToSlot(history, extracted);
    expect(slots?.business_domain?.value).toBe('healthcare');
    expect(slots?.core_workflows?.value).toBe('Patients book, doctors confirm.');
  });

  it('binds only the LAST asked question, not every turn', () => {
    const history = [
      turn('q1', 'Retail.', 'business_domain'),
      turn('q2', 'Shoppers and staff.', 'target_users_roles'),
    ];

    const slots = bindAnswerToSlot(history, undefined);
    expect(slots?.target_users_roles?.value).toBe('Shoppers and staff.');
    // q1's turn was the previous call's responsibility, not this one's.
    expect(slots?.business_domain).toBeUndefined();
  });

  /**
   * An unanswered slot becomes a question the owner forwards to their client.
   * Binding "not sure yet" would consume that question and hand the design a
   * non-answer dressed as a stated fact.
   */
  it.each(['not sure yet', "don't know", 'N/A', 'TBD', 'skip'])(
    'does not bind the non-answer %p',
    (answer) => {
      const history = [turn('q1', answer, 'budget_range')];
      expect(bindAnswerToSlot(history, undefined)?.budget_range).toBeUndefined();
    },
  );

  it('does not bind an empty answer', () => {
    expect(bindAnswerToSlot([turn('q1', '   ', 'timeline')], undefined)).toBeUndefined();
  });

  it('does nothing for a question that declared no target slot', () => {
    expect(bindAnswerToSlot([turn('q1', 'Some answer.')], undefined)).toBeUndefined();
  });

  it('ignores a target slot outside the catalog', () => {
    const history = [
      turn('q1', 'Answer.', 'made_up_slot' as unknown as 'target_market'),
    ];
    expect(bindAnswerToSlot(history, undefined)).toBeUndefined();
  });

  it('skips notes and correction turns when finding the last question', () => {
    const history: InterviewExchange[] = [
      turn('q1', 'Retail in Jordan.', 'target_market'),
      {
        question: {
          id: NOTES_ENTRY_ID,
          phase: InterviewPhase.Understanding,
          prompt: 'notes',
        },
        answer: 'pasted call notes',
      },
    ];

    expect(bindAnswerToSlot(history, undefined)?.target_market?.value).toBe(
      'Retail in Jordan.',
    );
  });

  it('strips pasted markup before the value enters the pipeline', () => {
    const history = [
      turn(
        'q1',
        'Patient books $\\rightarrow$ System verifies $\\rightarrow$ Doctor confirms',
        'core_workflows',
      ),
    ];

    const value = bindAnswerToSlot(history, undefined)?.core_workflows?.value;
    expect(value).toBe('Patient books → System verifies → Doctor confirms');
    expect(value).not.toContain('rightarrow');
  });
});

describe('stripMarkupArtifacts', () => {
  it('renders the LaTeX arrows that reached a real confirmation gate', () => {
    expect(stripMarkupArtifacts('A $\\rightarrow$ B')).toBe('A → B');
    expect(stripMarkupArtifacts('A \\to B')).toBe('A → B');
    expect(stripMarkupArtifacts('A --> B')).toBe('A → B');
  });

  it('unwraps styling that carries no meaning', () => {
    expect(stripMarkupArtifacts('\\textbf{Urgent} orders')).toBe('Urgent orders');
    expect(stripMarkupArtifacts('**Urgent** orders')).toBe('Urgent orders');
    expect(stripMarkupArtifacts('`orders` table')).toBe('orders table');
  });

  it('leaves ordinary prose — including real currency — untouched', () => {
    const prose = 'Customers pay $5,000 up front and the rest on delivery.';
    expect(stripMarkupArtifacts(prose)).toBe(prose);
  });

  it('is total on empty input', () => {
    expect(stripMarkupArtifacts('')).toBe('');
  });
});

describe('isPlanModeTranscript', () => {
  it('recognises a plan transcript by its catalog ids', () => {
    expect(
      isPlanModeTranscript([turn('a1', 'Goal.'), turn('a2', 'Roles.')]),
    ).toBe(true);
  });

  it('recognises an adaptive transcript by its minted ids', () => {
    expect(isPlanModeTranscript([turn('q1', 'A.'), turn('q2', 'B.')])).toBe(false);
  });

  /**
   * The case the old `hasFilledSlots()` proxy got wrong: an adaptive run whose
   * extraction failed has no slots, and was therefore read as plan mode — which
   * turned `question.phase` back into a data bucket and rendered raw answers
   * about data entities as the project's user roles.
   */
  it('stays adaptive when a mid-interview fallback mixed in plan questions', () => {
    expect(
      isPlanModeTranscript([turn('q1', 'A.'), turn('b1', 'B.')]),
    ).toBe(false);
  });

  it('is not plan mode with no asked questions at all', () => {
    expect(isPlanModeTranscript([])).toBe(false);
    expect(
      isPlanModeTranscript([
        {
          question: {
            id: NOTES_ENTRY_ID,
            phase: InterviewPhase.Understanding,
            prompt: 'notes',
          },
          answer: 'notes only',
        },
      ]),
    ).toBe(false);
  });
});
