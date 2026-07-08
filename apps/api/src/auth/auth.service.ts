import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPER_ADMIN_ROLE_KEY } from '@archivato/shared';
import type {
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  ProvisionUserInput,
  ProvisionedUser,
  RegisterInput,
  UpdateProfileInput,
} from '@archivato/shared';
import { generateStrongPassword } from './password-generator';
import { USER_REPOSITORY, type UserRepository } from './user.repository';
import {
  DEVICE_REGISTRATION_REPOSITORY,
  type DeviceRegistrationRepository,
} from './device-registration.repository';
import type { User } from './user.entity';
import { PasswordService } from './password.service';
import { TokenService, hashToken, type IssuedRefreshToken } from './token.service';
import { EmailVerificationService } from './email-verification.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { RoleService } from '../roles/role.service';
import { toAuthUser } from './user.mapper';

/**
 * The result of a successful authentication. The controller turns `accessToken`
 * and `refresh` into httpOnly cookies; only `user` is sent in the body.
 */
export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refresh: IssuedRefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(DEVICE_REGISTRATION_REPOSITORY)
    private readonly devices: DeviceRegistrationRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly emailVerification: EmailVerificationService,
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
    private readonly roles: RoleService,
  ) {}

  /** Map a user to the client-safe shape, enriched with their RBAC access. */
  private async buildAuthUser(user: User): Promise<AuthUser> {
    return toAuthUser(user, await this.roles.resolveAccess(user.id));
  }

  /** Create a local account, send a verification email, and start a session. */
  async register(input: RegisterInput): Promise<AuthSession> {
    // One account per device (anti-spam). We store only a hash of the client
    // fingerprint; a device that already registered an account is refused.
    const fingerprintHash = input.fingerprint
      ? hashToken(input.fingerprint)
      : null;
    if (fingerprintHash) {
      const knownDevice =
        await this.devices.findByFingerprintHash(fingerprintHash);
      if (knownDevice) {
        throw new ConflictException(
          'This device already has an account. Only one account per device is allowed — please sign in instead.',
        );
      }
    }
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      providers: ['password'],
    });
    // Link the device so it can't register a second account. The unique
    // constraint is the real guard against a concurrent double-submit; swallow
    // its violation so a race surfaces as the same friendly conflict.
    if (fingerprintHash) {
      try {
        await this.devices.create({ fingerprintHash, userId: user.id });
      } catch {
        /* unique-constraint race — the device link already exists */
      }
    }
    // Fire off the verification email; never block sign-up on mail delivery.
    await this.emailVerification.issueAndSend(user).catch(() => undefined);
    void this.analytics.recordSafe({ type: 'signup', userId: user.id });
    return this.startSession(user);
  }

  /**
   * Provision a staff account directly (super-admin action). Unlike self-service
   * registration this **bypasses the one-account-per-device gate**, creates the
   * account **pre-verified**, generates a strong random password (returned once
   * in plaintext for hand-off — only its hash is stored), and assigns the given
   * RBAC roles. No verification email is sent; the staff member signs in with
   * the temp password and can change it in settings.
   */
  async provisionStaff(input: ProvisionUserInput): Promise<ProvisionedUser> {
    const email = input.email.trim();
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const tempPassword = generateStrongPassword();
    const passwordHash = await this.passwords.hash(tempPassword);
    const user = await this.users.create({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      emailVerified: true,
      providers: ['password'],
    });
    await this.roles.setUserRoles(user.id, input.roleIds);
    return { user: await this.buildAuthUser(user), tempPassword };
  }

  /** Verify credentials and start a session. */
  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.users.findByEmail(input.email);
    // Generic message + password check even when absent — avoids leaking which
    // emails exist and which accounts are OAuth-only.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const ok = await this.passwords.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }
    void this.analytics.recordSafe({ type: 'login', userId: user.id });
    return this.startSession(user);
  }

  /** Rotate the refresh token and mint a fresh access token. */
  async refresh(rawRefresh: string): Promise<AuthSession> {
    const { userId, refresh } = await this.tokens.rotateRefreshToken(rawRefresh);
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return {
      user: await this.buildAuthUser(user),
      accessToken: this.tokens.signAccessToken(user),
      refresh,
    };
  }

  /** Revoke the presented refresh token (logout). */
  async logout(rawRefresh: string | undefined): Promise<void> {
    if (rawRefresh) await this.tokens.revokeRefreshToken(rawRefresh);
  }

  /** Look up the current user for GET /auth/me (bootstrapping the admin role). */
  async getUser(userId: string): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return this.buildAuthUser(await this.syncRole(user));
  }

  /** Update the signed-in user's editable profile fields (display name). */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    const saved = await this.users.save({
      ...user,
      displayName: input.displayName.trim(),
    });
    return this.buildAuthUser(saved);
  }

  /**
   * Set (a base64 data URI) or clear (`null`) the signed-in user's profile
   * picture. The payload is validated/size-capped by the DTO before it reaches
   * here; clearing falls the UI back to the initials avatar.
   */
  async updateAvatar(
    userId: string,
    avatarUrl: string | null,
  ): Promise<AuthUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    const saved = await this.users.save({ ...user, avatarUrl });
    return this.buildAuthUser(saved);
  }

  /**
   * Change (or, for OAuth-only accounts, set) the password. When the account
   * already has a password, the correct current one is required. Success
   * revokes all existing sessions and issues a fresh one, so other devices are
   * logged out while the current device stays signed in.
   */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
  ): Promise<AuthSession> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    if (user.passwordHash) {
      const ok =
        Boolean(input.currentPassword) &&
        (await this.passwords.compare(
          input.currentPassword as string,
          user.passwordHash,
        ));
      if (!ok) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    const passwordHash = await this.passwords.hash(input.newPassword);
    // Setting a first password (OAuth-only account) also enables local login.
    const providers = user.providers.includes('password')
      ? user.providers
      : [...user.providers, 'password' as const];
    const saved = await this.users.save({ ...user, passwordHash, providers });

    // Log out everywhere, then start a fresh session for this device.
    await this.tokens.revokeAllRefreshTokens(user.id);
    return this.startSession(saved);
  }

  /** Permanently delete the signed-in user and everything they own (cascade). */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    await this.tokens.revokeAllRefreshTokens(user.id);
    await this.users.delete(user.id);
  }

  /** Issue a session for an already-authenticated user (e.g. via OAuth). */
  createSessionFor(user: User): Promise<AuthSession> {
    return this.startSession(user);
  }

  private async startSession(user: User): Promise<AuthSession> {
    const synced = await this.syncRole(user);
    const refresh = await this.tokens.issueRefreshToken(synced.id);
    return {
      user: await this.buildAuthUser(synced),
      accessToken: this.tokens.signAccessToken(synced),
      refresh,
    };
  }

  /**
   * Bootstrap the admin role from the `ADMIN_EMAILS` allowlist: an email on the
   * list is promoted to `admin` on login/session issue. We only ever PROMOTE
   * here (demotion is a deliberate action), and persist only on a real change.
   */
  private async syncRole(user: User): Promise<User> {
    const allowlist = (this.config.get<string>('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!allowlist.includes(user.email.toLowerCase())) return user;

    // RBAC: ensure the allowlisted user holds the super-admin role (idempotent).
    await this.roles.assignByKey(user.id, SUPER_ADMIN_ROLE_KEY).catch(() => undefined);
    // Keep the legacy `role` column in sync for any not-yet-migrated readers.
    if (user.role !== 'admin') {
      return this.users.save({ ...user, role: 'admin' });
    }
    return user;
  }
}
