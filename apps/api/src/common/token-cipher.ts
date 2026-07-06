import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Symmetric encryption for secrets stored at rest (currently the GitHub OAuth
 * access token). AES-256-GCM with a random 96-bit IV per message; the output is
 * `iv:tag:ciphertext`, all base64. The key is derived (SHA-256) from
 * `GITHUB_TOKEN_SECRET`, falling back to `JWT_ACCESS_SECRET` so the feature works
 * without extra config while still allowing a dedicated key. Never log the
 * plaintext or the key.
 */
@Injectable()
export class TokenCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret =
      config.get<string>('GITHUB_TOKEN_SECRET') ||
      config.get<string>('JWT_ACCESS_SECRET') ||
      'dev-insecure-secret';
    // SHA-256 yields exactly the 32 bytes AES-256 needs from any-length secret.
    this.key = createHash('sha256').update(secret).digest();
  }

  /** Encrypt plaintext → `iv:tag:ciphertext` (all base64). */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  /** Decrypt a value produced by {@link encrypt}. Throws if tampered/invalid. */
  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed ciphertext');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
