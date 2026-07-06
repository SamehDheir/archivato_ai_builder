import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
// `repo` grants creating repos + pushing (private and public). Fine-grained
// alternatives exist but classic `repo` is the simplest broadly-compatible scope.
const SCOPE = 'repo';

/** Result of exchanging an authorization code. */
export interface GithubTokenGrant {
  accessToken: string;
  login: string;
  scopes: string;
}

/**
 * OAuth for the **scaffold GitHub App** (separate from the login OAuth app, since
 * it needs `repo` scope and its own callback). Enabled only when
 * `GITHUB_SCAFFOLD_CLIENT_ID` + `GITHUB_SCAFFOLD_CLIENT_SECRET` are set, so the
 * app boots fine without it (the manual-PAT push remains the fallback).
 * Native fetch, no SDK — mirrors the login OAuthService.
 */
@Injectable()
export class GithubOAuthService {
  private readonly logger = new Logger(GithubOAuthService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when the scaffold OAuth app is configured. */
  isEnabled(): boolean {
    return Boolean(this.clientId() && this.clientSecret());
  }

  /** The GitHub authorization URL to open (in a popup) for the given state. */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId() ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      // Let the user pick the account; don't silently reuse a prior grant.
      allow_signup: 'false',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Exchange the code for an access token and fetch the account login. */
  async exchangeCode(code: string): Promise<GithubTokenGrant> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId() ?? '',
        client_secret: this.clientSecret() ?? '',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      this.logger.error(`GitHub token exchange failed: ${detail}`);
      throw new Error('GitHub token exchange failed');
    }
    const data = (await res.json()) as {
      access_token?: string;
      scope?: string;
      error?: string;
    };
    if (!data.access_token) {
      this.logger.error(`GitHub token exchange returned no token: ${data.error}`);
      throw new Error('GitHub returned no access token');
    }

    const login = await this.fetchLogin(data.access_token);
    return {
      accessToken: data.access_token,
      login,
      scopes: data.scope ?? '',
    };
  }

  private async fetchLogin(token: string): Promise<string> {
    const res = await fetch(USER_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Archivato-AI-Builder',
      },
    });
    if (!res.ok) throw new Error('GitHub profile fetch failed');
    const user = (await res.json()) as { login?: string };
    return user.login ?? 'unknown';
  }

  // Prefer scaffold-specific credentials, but fall back to the login GitHub
  // OAuth App so a user who already set that up can reuse it — they only need to
  // add the scaffold callback URL to that app's allowed callback URLs.
  private clientId(): string | undefined {
    return (
      this.config.get<string>('GITHUB_SCAFFOLD_CLIENT_ID') ||
      this.config.get<string>('GITHUB_CLIENT_ID')
    );
  }

  private clientSecret(): string | undefined {
    return (
      this.config.get<string>('GITHUB_SCAFFOLD_CLIENT_SECRET') ||
      this.config.get<string>('GITHUB_CLIENT_SECRET')
    );
  }

  private redirectUri(): string {
    const base = this.config.get<string>('API_ORIGIN', 'http://localhost:3001');
    return `${base}/api/scaffold/github/connect/callback`;
  }
}
