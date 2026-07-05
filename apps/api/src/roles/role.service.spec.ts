import { ConflictException } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@archivato/shared';
import { RoleService } from './role.service';
import { InMemoryRoleRepository } from './in-memory-role.repository';

describe('RoleService', () => {
  let repo: InMemoryRoleRepository;
  let service: RoleService;

  beforeEach(async () => {
    repo = new InMemoryRoleRepository();
    service = new RoleService(repo);
    await service.ensureSystemRoles();
  });

  it('seeds the system roles idempotently', async () => {
    await service.ensureSystemRoles(); // second call must not duplicate
    const roles = await service.listRoles();
    const keys = roles.map((r) => r.key).sort();
    expect(keys).toEqual(['billing_admin', 'super_admin', 'support_agent', 'user']);
    expect(roles.every((r) => r.isSystem)).toBe(true);
  });

  it('grants super-admin the full permission catalog', async () => {
    const superAdmin = await repo.findByKey('super_admin');
    expect(superAdmin?.permissions.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('resolves the union of a user\'s roles as effective permissions', async () => {
    const support = await repo.findByKey('support_agent');
    const billing = await repo.findByKey('billing_admin');
    await service.assignByKey('u1', 'support_agent');
    await service.assignByKey('u1', 'billing_admin');

    const access = await service.resolveAccess('u1');
    expect(access.roles.sort()).toEqual(['billing_admin', 'support_agent']);
    expect(access.permissions).toContain('support:read_all');
    expect(access.permissions).toContain('billing:manage');
    expect(access.permissions).not.toContain('admin:users:manage');
    // sanity: union size = support perms + billing perms
    expect(access.permissions.length).toBe(
      support!.permissions.length + billing!.permissions.length,
    );
  });

  it('finds users by an effective permission', async () => {
    await service.assignByKey('agent', 'support_agent');
    await service.assignByKey('boss', 'super_admin');
    const withReadAll = await service.userIdsWithPermission('support:read_all');
    expect(withReadAll.sort()).toEqual(['agent', 'boss']);
    const withUsersManage = await service.userIdsWithPermission('admin:users:manage');
    expect(withUsersManage).toEqual(['boss']);
  });

  it('protects system roles from deletion', async () => {
    const support = await repo.findByKey('support_agent');
    await expect(service.deleteRole(support!.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a custom role and ignores unknown permission strings', async () => {
    const role = await service.createRole({
      key: 'Triage Team',
      name: 'Triage',
      permissions: ['support:read_all', 'not:a:real:perm' as never],
    });
    expect(role.key).toBe('triage_team');
    expect(role.permissions).toEqual(['support:read_all']);
    expect(role.isSystem).toBe(false);
  });

  it('keeps super-admin at the full catalog even if an edit tries to shrink it', async () => {
    const superAdmin = await repo.findByKey('super_admin');
    const updated = await service.updateRole(superAdmin!.id, { permissions: [] });
    expect(updated.permissions.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
