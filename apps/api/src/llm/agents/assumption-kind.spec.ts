/**
 * Assumptions vs. genuine open questions.
 *
 * The reported line, rendered among the assumptions of a real document:
 *
 *   *"سيتم اختيار إما Microsoft Teams أو Slack كمنصة إشعارات فورية"*
 *   (Either Microsoft Teams or Slack will be chosen as the instant notification
 *   platform)
 *
 * It reads as settled while describing something nobody decided. The client may
 * use one, the other, or neither, and each answer is different integration work
 * — so presenting it as an assumption invites them to skim past it, and the
 * scope then quietly assumes one of the two.
 *
 * The classifier is deliberately conservative in the direction of *keeping*
 * things as assumptions: an ordinary default relabelled as a blocking question
 * is a new annoyance in a document a client reads, while the status quo is
 * merely what shipped.
 */

import { classifyAssumptionKind, withAssumptionKinds } from '@archivato/shared';

describe('classifyAssumptionKind', () => {
  it('flags an unmade choice between two named platforms', () => {
    expect(
      classifyAssumptionKind(
        'Either Microsoft Teams or Slack will be chosen as the instant notification platform.',
      ),
    ).toBe('open_question');
  });

  it('flags the same sentence in Arabic', () => {
    expect(
      classifyAssumptionKind(
        'سيتم اختيار إما Microsoft Teams أو Slack كمنصة إشعارات فورية.',
      ),
    ).toBe('open_question');
  });

  it.each([
    'The hosting region is to be confirmed with the client.',
    'The payment provider has not yet been decided.',
    'Compliance framework: TBD.',
    'We will host in either the EU or the UAE region.',
  ])('flags a consequential undecided item: %s', (text) => {
    expect(classifyAssumptionKind(text)).toBe('open_question');
  });

  it.each([
    'Assumed standard TLS encryption is sufficient, as no specific compliance regime was mentioned.',
    'Assumed the project needs a "Dispatcher" role — it was inferred from the described workflows.',
    'Assumed tasks are archived rather than permanently deleted.',
    'Assumed the team works in a single time zone.',
  ])('leaves a low-stakes default as an assumption: %s', (text) => {
    expect(classifyAssumptionKind(text)).toBe('assumption');
  });

  it('does not flag a consequential TOPIC that carries no unmade choice', () => {
    // "Compliance" alone is not enough — it takes the topic AND an unresolved
    // alternation. Otherwise every sensible security default becomes a blocker.
    expect(
      classifyAssumptionKind('Assumed the payment flow uses a hosted checkout page.'),
    ).toBe('assumption');
  });

  it('keeps a kind the model supplied and fills only the gaps', () => {
    const result = withAssumptionKinds([
      { assumption: 'Something subtle we cannot detect', impactIfWrong: '', kind: 'open_question' },
      { assumption: 'Assumed a 30-day retention window.', impactIfWrong: '' },
    ]);

    expect(result[0].kind).toBe('open_question');
    expect(result[1].kind).toBe('assumption');
  });

  it('is empty-safe', () => {
    expect(classifyAssumptionKind('')).toBe('assumption');
    expect(withAssumptionKinds([])).toEqual([]);
  });
});
