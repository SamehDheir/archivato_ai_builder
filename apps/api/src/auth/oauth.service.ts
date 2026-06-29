import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthProvider } from '@archivato/shared';
import { USER_REPOSITORY, type UserRepository } from './user.repository';
import type { User } from './user.entity';

/** The OAuth providers we support (a subset of AuthProvider). */
export type OAuthProvider = 'google' | 'github';

/** Normalized profile pulled from a provider after the code exchange. */
interface OAuthProfile {
  email: string;
  displayName: string;
  /** Whether the provider asserts the email is verified (gate for linking). */
  emailVerified: boolean;
}

interface ProviderEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}

/**
 * OAuth login (Slice 9c) for Google & GitHub via a manual authorization-code
 * flow (native fetch — no extra SDK). A provider is only enabled when its
 * client id + secret are configured, so the app boots fine without them.
 *
 * Accounts are linked by VERIFIED email: signing in with Google/GitHub for an
 * email that already has an account attaches the provider to it; otherwise a new
 * password-less, email-verified account is created.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /** Which providers are configured (for the client to render buttons). */
  enabledProviders(): Record<OAuthProvider, boolean> {
    return { google: this.isEnabled('google'), github: this.isEnabled('github') };
  }

  isEnabled(provider: OAuthProvider): boolean {
    return Boolean(this.clientId(provider) && this.clientSecret(provider));
  }

  /** The provider's authorization URL to redirect the user to. */
  buildAuthorizeUrl(provider: OAuthProvider, state: string): string {
    const ep = this.endpoints(provider);
    const params = new URLSearchParams({
      client_id: this.clientId(provider)!,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: ep.scope,
      state,
    });
    return `${ep.authorizeUrl}?${params.toString()}`;
  }

  /** Exchange the auth code, fetch the profile, then link or create the user. */
  async loginWithCode(provider: OAuthProvider, code: string): Promise<User> {
    const accessToken = await this.exchangeCode(provider, code);
    const profile = await this.endpoints(provider).fetchProfile(accessToken);
    // Require a verified email: linking accounts by an unverified email is an
    // account-takeover vector.
    if (!profile.email || !profile.emailVerified) {
      throw new Error('OAuth provider did not return a verified email');
    }
    return this.linkOrCreate(provider, profile);
  }

  // ── user linking ────────────────────────────────────────────────────────

  private async linkOrCreate(
    provider: OAuthProvider,
    profile: OAuthProfile,
  ): Promise<User> {
    const email = profile.email.trim();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      // Attach the provider if it isn't already linked.
      if (!existing.providers.includes(provider)) {
        return this.users.save({
          ...existing,
          providers: [...existing.providers, provider as AuthProvider],
          emailVerified: true,
        });
      }
      return existing;
    }
    return this.users.create({
      email,
      passwordHash: null, // OAuth-only account (no local password)
      displayName: profile.displayName || email.split('@')[0],
      emailVerified: true, // the provider vouches for the email
      providers: [provider as AuthProvider],
    });
  }

  // ── token exchange ──────────────────────────────────────────────────────

  private async exchangeCode(
    provider: OAuthProvider,
    code: string,
  ): Promise<string> {
    const res = await fetch(this.endpoints(provider).tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId(provider)!,
        client_secret: this.clientSecret(provider)!,
        code,
        redirect_uri: this.redirectUri(provider),
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      this.logger.error(`${provider} token exchange failed: ${detail}`);
      throw new Error(`${provider} token exchange failed`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error(`${provider} returned no access token`);
    return data.access_token;
  }

  // ── provider endpoints ──────────────────────────────────────────────────

  private endpoints(provider: OAuthProvider): ProviderEndpoints {
    if (provider === 'google') {
      return {
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
        fetchProfile: async (token) => {
          const r = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!r.ok) throw new Error('google profile fetch failed');
          const u = (await r.json()) as {
            email?: string;
            name?: string;
            verified_email?: boolean;
          };
          return {
            email: u.email ?? '',
            displayName: u.name ?? '',
            emailVerified: u.verified_email === true,
          };
        },
      };
    }
    // github
    return {
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scope: 'read:user user:email',
      fetchProfile: async (token) => {
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Archivato',
        };
        const [userRes, emailRes] = await Promise.all([
          fetch('https://api.github.com/user', { headers }),
          fetch('https://api.github.com/user/emails', { headers }),
        ]);
        if (!userRes.ok) throw new Error('github profile fetch failed');
        const u = (await userRes.json()) as { name?: string; login?: string };
        let email = '';
        if (emailRes.ok) {
          const emails = (await emailRes.json()) as {
            email: string;
            primary: boolean;
            verified: boolean;
          }[];
          email =
            emails.find((e) => e.primary && e.verified)?.email ??
            emails.find((e) => e.verified)?.email ??
            '';
        }
        // `email` is only ever set from a verified GitHub email above.
        return {
          email,
          displayName: u.name ?? u.login ?? '',
          emailVerified: email !== '',
        };
      },
    };
  }

  // ── config helpers ──────────────────────────────────────────────────────

  private clientId(provider: OAuthProvider): string | undefined {
    return this.config.get<string>(`${provider.toUpperCase()}_CLIENT_ID`);
  }

  private clientSecret(provider: OAuthProvider): string | undefined {
    return this.config.get<string>(`${provider.toUpperCase()}_CLIENT_SECRET`);
  }

  /** The registered callback URL; must match the provider's app settings. */
  private redirectUri(provider: OAuthProvider): string {
    const base = this.config.get<string>('API_ORIGIN', 'http://localhost:3001');
    return `${base}/api/auth/oauth/${provider}/callback`;
  }
}
