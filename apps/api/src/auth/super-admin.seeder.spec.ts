import { ConfigService } from '@nestjs/config';
import { SuperAdminSeeder } from './super-admin.seeder';
import { PasswordService } from './password.service';
import { InMemoryUserRepository } from './in-memory-user.repository';
import { RoleService } from '../roles/role.service';
import { InMemoryRoleRepository } from '../roles/in-memory-role.repository';

async function makeSeeder(env: Record<string, unknown>) {
  const users = new InMemoryUserRepository();
  const roles = new RoleService(new InMemoryRoleRepository());
  await roles.onModuleInit(); // seed system roles (super_admin must exist)
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
