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
 * Does nothing if either variable is unset. Runs after `RoleService` seeds the
 * system roles (AuthModule imports RolesModule, so it initializes first).
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

    if (!existing) {
      this.logger.log(`Seeded super admin account "${email}".`);
    }
    // Idempotent — ensures the role grant survives even for an existing account.
    await this.roles
      .assignByKey(user.id, SUPER_ADMIN_ROLE_KEY)
      .catch(() => undefined);
    // Keep the legacy `role` column in sync (Prisma admin-count reporting reads it).
    if (user.role !== 'admin') {
      await this.users.save({ ...user, role: 'admin' });
    }
  }
}
