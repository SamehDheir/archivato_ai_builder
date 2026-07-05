import { randomInt } from 'crypto';

// Character classes for generated passwords. Ambiguous glyphs (O/0, l/1/I) are
// omitted so a password shown on screen can be transcribed without confusion.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Cryptographically pick one character from a set. */
function pick(set: string): string {
  return set[randomInt(set.length)];
}

/** Fisher–Yates shuffle using a CSPRNG. */
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

/**
 * Generate a strong random password for a provisioned staff account. Guarantees
 * at least one lowercase, uppercase, digit, and symbol, then fills the rest from
 * the full alphabet — all draws from a CSPRNG (`crypto.randomInt`).
 */
export function generateStrongPassword(length = 16): string {
  const len = Math.max(length, 8);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  for (let i = chars.length; i < len; i++) chars.push(pick(ALL));
  return shuffle(chars).join('');
}
