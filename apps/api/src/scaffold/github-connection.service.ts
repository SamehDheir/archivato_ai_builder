import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GithubConnectionStatus } from '@archivato/shared';
import { TokenCipher } from '../common/token-cipher';
import { GithubOAuthService } from './github-oauth.service';
import {
  GITHUB_CONNECTION_REPOSITORY,
  type GithubConnectionRepository,
} from './github-connection.repository';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the OAuth round-trip

/**
 * Orchestrates the stored GitHub connection: the OAuth handshake, encrypting the
 * access token at rest, exposing connection status, and resolving a usable token
 * for the scaffold push. Also mints/verifies the signed OAuth `state` that binds
 * the callback to the user who started the flow (CSRF + user binding without
 * relying on the short-lived access cookie).
 */
@Injectable()
export class GithubConnectionService {
  constructor(
    private readonly oauth: GithubOAuthService,
    private readonly cipher: TokenCipher,
    private readonly config: ConfigService,
    @Inject(GITHUB_CONNECTION_REPOSITORY)
    private readonly connections: GithubConnectionRepository,
  ) {}

  isAvailable(): boolean {
    return this.oauth.isEnabled();
  }

  buildAuthorizeUrl(state: string): string {
    return this.oauth.buildAuthorizeUrl(state);
  }

  /**
   * Mint a signed state for the OAuth start. Returns the `state` value sent to
   * GitHub and the signed `cookie` value to set (verified back on callback).
   */
  createState(userId: string): { state: string; cookie: string } {
    const nonce = randomBytes(16).toString('hex');
    const payload = { u: userId, n: nonce, e: Date.now() + STATE_TTL_MS };
    const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = this.sign(json);
    return { state: nonce, cookie: `${json}.${sig}` };
  }

  /** Verify the state cookie against the returned `state`; returns the userId. */
  verifyState(cookie: string | undefined, stateParam: string | undefined): string {
    if (!cookie || !stateParam) throw new BadRequestException('Missing OAuth state');
    const [json, sig] = cookie.split('.');
    if (!json || !sig || !this.verifySig(json, sig)) {
      throw new BadRequestException('Invalid OAuth state');
    }
    let payload: { u?: string; n?: string; e?: number };
    try {
      payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed OAuth state');
    }
    if (!payload.u || !payload.n || !payload.e || payload.e < Date.now()) {
      throw new BadRequestException('Expired OAuth state');
    }
    if (payload.n !== stateParam) throw new BadRequestException('OAuth state mismatch');
    return payload.u;
  }

  /** Exchange the code, encrypt the token, and store the connection. */
  async connect(userId: string, code: string): Promise<{ login: string }> {
    const grant = await this.oauth.exchangeCode(code);
    await this.connections.upsert({
      userId,
      tokenEncrypted: this.cipher.encrypt(grant.accessToken),
      githubLogin: grant.login,
      scopes: grant.scopes,
    });
    return { login: grant.login };
  }

  async status(userId: string): Promise<GithubConnectionStatus> {
    const available = this.isAvailable();
    const record = await this.connections.findByUserId(userId);
    return {
      available,
      connected: Boolean(record),
      login: record?.githubLogin,
    };
  }

  async disconnect(userId: string): Promise<void> {
    await this.connections.deleteByUserId(userId);
  }

  /** Decrypt the stored access token for a user, or null if not connected. */
  async resolveToken(userId: string): Promise<string | null> {
    const record = await this.connections.findByUserId(userId);
    if (!record) return null;
    return this.cipher.decrypt(record.tokenEncrypted);
  }

  // ── signed-state helpers ──────────────────────────────────────────────────

  private stateSecret(): string {
    return (
      this.config.get<string>('GITHUB_TOKEN_SECRET') ||
      this.config.get<string>('JWT_ACCESS_SECRET') ||
      'dev-insecure-secret'
    );
  }

  private sign(value: string): string {
    return createHmac('sha256', this.stateSecret()).update(value).digest('base64url');
  }

  private verifySig(value: string, sig: string): boolean {
    const expected = this.sign(value);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
