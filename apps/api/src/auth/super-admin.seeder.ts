import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SUPER_ADMIN_ROLE_KEY } from '@archivato/shared';
import { USER_REPOSITORY, type UserRepository } from './user.repository';
import { PasswordService } from './password.service';
import { RoleService } from '../roles/role.service';

/**
 * Seeds a single Super Admin account on boot from `SUPER_ADMIN_EMAIL` /
 * `SUPER_ADMIN_PASSWORD`. This replaces the old `ADMIN_EMAILS` promote-on-login
 * allowlist with a **concrete, ready-to-log-in account** — no self-registration
 * required. Credentials are managed as config (env), so this is authoritative:
 *
 * - Creates the account (pre-verified, local password) if it doesn't exist.
 * - Always ensures it holds the `super_admin` role (+ the legacy `role` column).
 * - Keeps the password in sync with `SUPER_ADMIN_PASSWORD` so the documented
 *   credentials always work (change the password by changing the env var).
 *
 * Does nothing if either variable is unset. It does NOT rely on `RoleService`
 * having initialized first — it calls `ensureSystemRoles()` itself, because the
 * one time that assumption failed the account was created with no permissions
 * and the failure was swallowed.
 */
@Injectable()
export class SuperAdminSeeder implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminSeeder.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly roles: RoleService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('SUPER_ADMIN_EMAIL')?.trim();
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');
    if (!email || !password) return;

    const passwordHash = await this.passwords.hash(password);
    const existing = await this.users.findByEmail(email);

    const user = existing
      ? await this.users.save({
          ...existing,
          passwordHash,
          emailVerified: true,
          role: 'admin',
          providers: existing.providers.includes('password')
            ? existing.providers
            : [...existing.providers, 'password'],
        })
      : await this.users.create({
          email,
          passwordHash,
          displayName: 'Super Admin',
          emailVerified: true,
          providers: ['password'],
        });

    // Guarantee the role EXISTS before granting it, rather than trusting module
    // init order. `assignByKey` throws when the role row is absent, and on a
    // fresh database that is a real window: this used to depend on RolesModule's
    // `onModuleInit` having already run, and when it hadn't, the account was
    // created with the legacy `role: 'admin'` column set and **no RBAC grant** —
    // which authorizes nothing, because permissions resolve from `user_roles`.
    // The account then logged in as an ordinary customer. `ensureSystemRoles` is
    // idempotent and public, so calling it here costs one query and removes the
    // ordering assumption entirely.
    await this.roles.ensureSystemRoles();

    // Idempotent — ensures the role grant survives even for an existing account.
    try {
      await this.roles.assignByKey(user.id, SUPER_ADMIN_ROLE_KEY);
    } catch (err) {
      // Never fail the boot over this, but never hide it either: the previous
      // `.catch(() => undefined)` turned "your super admin has no powers" into a
      // silent condition that looked, from the logs, exactly like success.
      this.logger.error(
        `Seeded super admin "${email}" but FAILED to grant the ${SUPER_ADMIN_ROLE_KEY} role — ` +
          `the account will sign in with no permissions. Cause: ${String(err)}`,
      );
      // Return BEFORE the legacy sync below, on purpose. `users.role` authorizes
      // nothing (every guard reads `permissions`, resolved from `user_roles`), so
      // writing 'admin' there after a failed grant produces a row that claims
      // admin while the app treats the account as a customer — which is the
      // contradiction that sent us looking at the wrong table in the first place.
      return;
    }

    if (!existing) {
      this.logger.log(`Seeded super admin account "${email}".`);
    }
    // Keep the legacy `role` column in sync (Prisma admin-count reporting reads it).
    if (user.role !== 'admin') {
      await this.users.save({ ...user, role: 'admin' });
    }
  }
}
