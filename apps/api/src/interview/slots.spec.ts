import type { OpenQuestion, SlotMap, SlotValue } from '@archivato/shared';
import {
  domainFollowUps,
  isSlotKey,
  mergeSlots,
  openQuestionForSlot,
  reconcileOpenQuestions,
  SLOT_CATALOG,
} from './slots';

const explicit = (value: string): SlotValue => ({
  value,
  confidence: 'high',
  source: 'explicit',
});
const inferred = (value: string): SlotValue => ({
  value,
  confidence: 'low',
  source: 'inferred',
});

describe('mergeSlots', () => {
  it('adds a new slot', () => {
    const out = mergeSlots({}, { budget_range: explicit('$10k') });
    expect(out.budget_range).toEqual(explicit('$10k'));
  });

  it('an explicit value overwrites an earlier inferred one', () => {
    const existing: SlotMap = { timeline: inferred('a few months') };
    const out = mergeSlots(existing, { timeline: explicit('by March') });
    expect(out.timeline).toEqual(explicit('by March'));
  });

  it('an inferred value NEVER overwrites an explicit one', () => {
    const existing: SlotMap = { timeline: explicit('by March') };
    const out = mergeSlots(existing, { timeline: inferred('sometime this year') });
    expect(out.timeline).toEqual(explicit('by March'));
  });

  it('an inferred value may refresh an earlier inferred one', () => {
    const existing: SlotMap = { budget_range: inferred('small') };
    const out = mergeSlots(existing, { budget_range: inferred('~$8k') });
    expect(out.budget_range).toEqual(inferred('~$8k'));
  });

  it('never drops slots the incoming turn did not mention', () => {
    const existing: SlotMap = {
      budget_range: explicit('$10k'),
      timeline: explicit('by March'),
    };
    const out = mergeSlots(existing, { business_domain: inferred('clinics') });
    expect(out.budget_range).toEqual(explicit('$10k'));
    expect(out.timeline).toEqual(explicit('by March'));
    expect(out.business_domain).toEqual(inferred('clinics'));
  });

  it('ignores unknown slot keys', () => {
    const out = mergeSlots({}, {
      not_a_real_slot: explicit('x'),
    } as unknown as SlotMap);
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('returns a fresh object (no mutation of the input)', () => {
    const existing: SlotMap = { timeline: explicit('by March') };
    const out = mergeSlots(existing, { budget_range: explicit('$10k') });
    expect(out).not.toBe(existing);
    expect(existing.budget_range).toBeUndefined();
  });
});

describe('reconcileOpenQuestions', () => {
  const q = (slotKey: string): OpenQuestion => ({
    slotKey,
    questionForClient: `What about ${slotKey}?`,
  });

  it('merges incoming questions by slot key (newest wins)', () => {
    const out = reconcileOpenQuestions([q('budget_range')], [q('timeline')], {});
    expect(out.map((x) => x.slotKey).sort()).toEqual([
      'budget_range',
      'timeline',
    ]);
  });

  it('drops a question once its slot is explicitly answered', () => {
    const out = reconcileOpenQuestions([q('budget_range')], undefined, {
      budget_range: explicit('$10k'),
    });
    expect(out).toHaveLength(0);
  });

  it('keeps a question when the slot is only inferred (a guess needs confirming)', () => {
    const out = reconcileOpenQuestions([q('budget_range')], undefined, {
      budget_range: inferred('smallish'),
    });
    expect(out).toHaveLength(1);
  });

  it('keeps a question for a slot marked n/a', () => {
    const out = reconcileOpenQuestions([q('integrations')], undefined, {
      integrations: { value: '', confidence: 'high', source: 'explicit', na: true },
    });
    expect(out).toHaveLength(1);
  });

  it('returns questions in slot-catalog order', () => {
    const out = reconcileOpenQuestions(
      [q('timeline'), q('business_domain'), q('budget_range')],
      undefined,
      {},
    );
    expect(out.map((x) => x.slotKey)).toEqual([
      'business_domain',
      'budget_range',
      'timeline',
    ]);
  });
});

describe('domainFollowUps', () => {
  it('returns hints for a known domain', () => {
    expect(domainFollowUps('e-commerce').length).toBeGreaterThan(0);
    expect(domainFollowUps('healthcare').length).toBeGreaterThan(0);
  });

  it('matches loosely (a domain phrase that contains a known key)', () => {
    expect(domainFollowUps('healthcare / clinics')).toEqual(
      domainFollowUps('healthcare'),
    );
  });

  it('returns [] for an unknown or missing domain', () => {
    expect(domainFollowUps('underwater basket weaving')).toEqual([]);
    expect(domainFollowUps(null)).toEqual([]);
  });
});

describe('catalog + helpers', () => {
  it('has a catalog entry (with a client template) for every slot key', () => {
    for (const key of Object.keys(SLOT_CATALOG)) {
      expect(SLOT_CATALOG[key as keyof typeof SLOT_CATALOG].askClientTemplate)
        .toBeTruthy();
    }
  });

  it('builds a client question from the catalog template', () => {
    const oq = openQuestionForSlot('budget_range');
    expect(oq.slotKey).toBe('budget_range');
    expect(oq.questionForClient).toBe(SLOT_CATALOG.budget_range.askClientTemplate);
  });

  it('narrows known vs unknown slot keys', () => {
    expect(isSlotKey('timeline')).toBe(true);
    expect(isSlotKey('nope')).toBe(false);
  });
});
