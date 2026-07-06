import type { ConfigService } from '@nestjs/config';
import { TokenCipher } from './token-cipher';

function cipher(secret = 'a-strong-encryption-secret'): TokenCipher {
  const config = {
    get: (key: string) => (key === 'GITHUB_TOKEN_SECRET' ? secret : undefined),
  } as unknown as ConfigService;
  return new TokenCipher(config);
}

describe('TokenCipher', () => {
  it('round-trips a value (encrypt → decrypt)', () => {
    const c = cipher();
    const secret = 'ghp_supersecrettoken_ABC123';
    const enc = c.encrypt(secret);
    expect(enc).not.toContain(secret); // ciphertext must not leak plaintext
    expect(c.decrypt(enc)).toBe(secret);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const c = cipher();
    expect(c.encrypt('same')).not.toBe(c.encrypt('same'));
  });

  it('emits the iv:tag:ciphertext shape (all base64)', () => {
    const parts = cipher().encrypt('x').split(':');
    expect(parts).toHaveLength(3);
    for (const p of parts) {
      expect(p.length).toBeGreaterThan(0);
      expect(() => Buffer.from(p, 'base64')).not.toThrow();
    }
  });

  it('fails to decrypt when the auth tag is tampered with', () => {
    const c = cipher();
    const [iv, , data] = c.encrypt('secret').split(':');
    const forgedTag = Buffer.alloc(16).toString('base64');
    expect(() => c.decrypt(`${iv}:${forgedTag}:${data}`)).toThrow();
  });

  it('cannot decrypt ciphertext produced with a different key', () => {
    const enc = cipher('key-one').encrypt('secret');
    expect(() => cipher('key-two').decrypt(enc)).toThrow();
  });

  it('throws on malformed input', () => {
    expect(() => cipher().decrypt('not-a-valid-payload')).toThrow();
  });
});
