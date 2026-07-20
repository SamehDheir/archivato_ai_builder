import { ConfigService } from '@nestjs/config';
import { SuperAdminSeeder } from './super-admin.seeder';
import { PasswordService } from './password.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { RoleService } from '../roles/role.service';
import { InMemoryRoleRepository } from '../roles/in-memory-role.repository';

/**
 * `seedRolesFirst` mirrors module init order. It defaults to true because that
 * is the steady state, but note that **passing true is what hid a real bug**:
 * every test here used to pre-seed the roles, so none of them exercised a fresh
 * database — where the roles table is empty and `assignByKey` throws.
 */
async function makeSeeder(
  env: Record<string, unknown>,
  seedRolesFirst = true,
) {
  const users = new InMemoryUserRepository();
  const roles = new RoleService(new InMemoryRoleRepository());
  if (seedRolesFirst) await roles.onModuleInit();
  const seeder = new SuperAdminSeeder(
    users,
    new PasswordService(),
    roles,
    new ConfigService(env),
  );
  return { users, roles, seeder };
}

describe('SuperAdminSeeder', () => {
  it('seeds a pre-verified super admin account holding the super_admin role', async () => {
    const { users, roles, seeder } = await makeSeeder({
      SUPER_ADMIN_EMAIL: 'root@example.com',
      SUPER_ADMIN_PASSWORD: 'seed-pass-123$',
    });

    await seeder.onModuleInit();

    const user = await users.findByEmail('root@example.com');
    expect(user).not.toBeNull();
    expect(user!.emailVerified).toBe(true);
    expect(user!.role).toBe('admin');
    expect(user!.providers).toContain('password');
    const access = await roles.resolveAccess(user!.id);
    expect(access.roles).toContain('super_admin');
    // Password actually verifies.
    expect(
      await new PasswordService().compare('seed-pass-123$', user!.passwordHash!),
    ).toBe(true);
  });

  /**
   * The fresh-database case, and the one that actually broke.
   *
   * On a wiped database the roles table is empty when the seeder runs. It used
   * to call `assignByKey(...).catch(() => undefined)`, so the `NotFoundException`
   * for the missing role vanished and the account was created with the legacy
   * `role: 'admin'` column and **no grant in `user_roles`**. Nothing authorizes
   * off that column — every guard reads `permissions`, resolved from the grant —
   * so the super admin signed in as an ordinary customer, and the users table
   * said "admin" the whole time.
   */
  it('grants the role even when the roles table has not been seeded yet', async () => {
    const { users, roles, seeder } = await makeSeeder(
      {
        SUPER_ADMIN_EMAIL: 'root@example.com',
        SUPER_ADMIN_PASSWORD: 'seed-pass-123$',
      },
      false, // no roles exist yet — a fresh database
    );

    await seeder.onModuleInit();

    const user = await users.findByEmail('root@example.com');
    expect(user).not.toBeNull();

    const access = await roles.resolveAccess(user!.id);
    expect(access.roles).toContain('super_admin');
    // The grant is only meaningful if it carries permissions — an account with
    // an empty permission set is exactly what "logs in as a user" looks like.
    expect(access.permissions.length).toBeGreaterThan(0);
    expect(access.permissions).toContain('admin:analytics');
  });

  it('does nothing when either variable is unset', async () => {
    const { users, seeder } = await makeSeeder({
      SUPER_ADMIN_EMAIL: 'root@example.com',
    });
    await seeder.onModuleInit();
    expect(await users.findByEmail('root@example.com')).toBeNull();
  });

  it('is idempotent and keeps the seed password authoritative', async () => {
    const { users, seeder } = await makeSeeder({
      SUPER_ADMIN_EMAIL: 'root@example.com',
      SUPER_ADMIN_PASSWORD: 'seed-pass-123$',
    });

    await seeder.onModuleInit();
    const first = await users.findByEmail('root@example.com');
    // A second boot reuses the same account (no duplicate) and re-applies the password.
    await seeder.onModuleInit();
    const second = await users.findByEmail('root@example.com');
    expect(second!.id).toBe(first!.id);
    expect(
      await new PasswordService().compare('seed-pass-123$', second!.passwordHash!),
    ).toBe(true);
  });
});
