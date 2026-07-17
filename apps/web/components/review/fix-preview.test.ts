import { diffSection, sectionLines } from './fix-preview';

describe('sectionLines', () => {
  it('reads a record as its fields in reading order', () => {
    expect(
      sectionLines([
        { id: 'NFR-1', category: 'security', description: 'Encrypt at rest' },
      ]),
    ).toEqual(['NFR-1 · security · Encrypt at rest']);
  });

  it('appends a role\'s permissions', () => {
    expect(
      sectionLines([
        { name: 'Admin', description: 'Runs the clinic', permissions: ['read', 'write'] },
      ]),
    ).toEqual(['Admin · Runs the clinic · [read, write]']);
  });

  it('splits a prose section into lines', () => {
    expect(sectionLines('First para.\n\nSecond para.')).toEqual([
      'First para.',
      'Second para.',
    ]);
  });

  it('falls back to the raw shape rather than hiding content', () => {
    // A preview that silently drops a field would get approval for a change the
    // owner never saw.
    expect(sectionLines([{ surprise: 42 }])).toEqual(['{"surprise":42}']);
  });

  it('reads an absent section as empty', () => {
    expect(sectionLines(undefined)).toEqual([]);
    expect(sectionLines(null)).toEqual([]);
  });
});

describe('diffSection', () => {
  it('marks added and unchanged lines', () => {
    const diff = diffSection(
      [{ id: 'NFR-1', category: 'general', description: 'Fast' }],
      [
        { id: 'NFR-1', category: 'general', description: 'Fast' },
        { id: 'NFR-2', category: 'security', description: 'Encrypted' },
      ],
    );

    expect(diff.before.map((l) => l.kind)).toEqual(['same']);
    expect(diff.after.map((l) => l.kind)).toEqual(['same', 'added']);
    expect(diff.changed).toBe(true);
  });

  it('marks a removed line', () => {
    const diff = diffSection(['Must run in the EU', 'Legacy'], ['Must run in the EU']);

    expect(diff.before.map((l) => l.kind)).toEqual(['same', 'removed']);
    expect(diff.after.map((l) => l.kind)).toEqual(['same']);
    expect(diff.changed).toBe(true);
  });

  it('reports no change when the content is identical', () => {
    const diff = diffSection(['A'], ['A']);
    expect(diff.changed).toBe(false);
  });

  it('handles a section that was empty before', () => {
    const diff = diffSection(undefined, [{ item: 'Native apps' }]);
    expect(diff.before).toEqual([]);
    expect(diff.after).toEqual([{ text: 'Native apps', kind: 'added' }]);
  });
});
