import { initialsFromName } from '@archivato/shared';

describe('initialsFromName', () => {
  it('uses the first + last word initials for a full name', () => {
    expect(initialsFromName('Ada Lovelace')).toBe('AL');
    expect(initialsFromName('Grace Brewster Hopper')).toBe('GH');
  });

  it('uses the first two letters for a single word', () => {
    expect(initialsFromName('Madonna')).toBe('MA');
    expect(initialsFromName('yo')).toBe('YO');
  });

  it('trims and collapses surrounding / inner whitespace', () => {
    expect(initialsFromName('  Ada   Lovelace  ')).toBe('AL');
  });

  it('falls back to "?" for an empty / whitespace name', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });

  it('handles non-latin names without splitting characters', () => {
    expect(initialsFromName('أحمد علي')).toBe('أع');
    // A single emoji "word" is returned as a whole grapheme, not a broken pair.
    expect(initialsFromName('😀')).toBe('😀');
  });
});
