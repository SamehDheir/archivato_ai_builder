import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  SUPER_ADMIN_ROLE_KEY,
  SYSTEM_ROLES,
  isPermission,
  resolvePermissions,
  type Permission,
  type RoleView,
} from '@archivato/shared';
import { ROLE_REPOSITORY, type RoleRepository } from './role.repository';
import type { Role, UpdateRoleInput } from './role.entity';

/** A user's resolved RBAC context — role keys + the union of their permissions. */
export interface ResolvedAccess {
  roles: string[];
  permissions: Permission[];
}

/**
 * Owns RBAC domain logic: seeds the system roles on boot, resolves a user's
 * effective permissions (union of their roles), manages assignment, and provides
 * role CRUD (with system-role protections). Reused by AuthModule (to enrich the
 * AuthUser) and, later, the admin role-management API.
 */
@Injectable()
export class RoleService implements OnModuleInit {
  private readonly logger = new Logger(RoleService.name);

  constructor(
    @Inject(ROLE_REPOSITORY) private readonly repo: RoleRepository,
  ) {}

  /** Seed the system roles once the module is ready (idempotent). */
  async onModuleInit(): Promise<void> {
    await this.ensureSystemRoles();
  }

  /**
   * Create any missing system roles. Super-admin is reconciled to the FULL
   * catalog every boot (so it can never be locked out of a newly added
   * permission); other system roles are only created if absent, preserving any
   * runtime edits an admin made to them.
   */
  async ensureSystemRoles(): Promise<void> {
    for (const seed of SYSTEM_ROLES) {
      const existing = await this.repo.findByKey(seed.key);
      if (!existing) {
        await this.repo.create({ ...seed, isSystem: true });
        this.logger.log(`Seeded system role "${seed.key}".`);
      } else if (
        seed.key === SUPER_ADMIN_ROLE_KEY &&
        !sameSet(existing.permissions, ALL_PERMISSIONS)
      ) {
        await this.repo.update(existing.id, { permissions: [...ALL_PERMISSIONS] });
        this.logger.log('Reconciled super-admin permissions to the full catalog.');
      }
    }
  }

  /** The user's role keys + effective (union) permissions. */
  async resolveAccess(userId: string): Promise<ResolvedAccess> {
    const roles = await this.repo.rolesForUser(userId);
    return {
      roles: roles.map((r) => r.key),
      permissions: resolvePermissions(roles),
    };
  }

  listRoles(): Promise<Role[]> {
    return this.repo.findAll();
  }

  /** Roles with their user counts, for the role-management UI. */
  async roleViews(): Promise<RoleView[]> {
    const roles = await this.repo.findAll();
    return Promise.all(
      roles.map(async (r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        isSystem: r.isSystem,
        userCount: (await this.repo.userIdsWithRole(r.id)).length,
      })),
    );
  }

  rolesForUser(userId: string): Promise<Role[]> {
    return this.repo.rolesForUser(userId);
  }

  /** Role keys a user holds (for the admin user table). */
  async roleKeysForUser(userId: string): Promise<string[]> {
    return (await this.repo.rolesForUser(userId)).map((r) => r.key);
  }

  /** Role ids a user holds (for the assignment editor). */
  async roleIdsForUser(userId: string): Promise<string[]> {
    return (await this.repo.rolesForUser(userId)).map((r) => r.id);
  }

  /** Assign a role by its stable key (idempotent); used for bootstrapping. */
  async assignByKey(userId: string, key: string): Promise<void> {
    const role = await this.repo.findByKey(key);
    if (!role) throw new NotFoundException(`Role "${key}" not found.`);
    await this.repo.assign(userId, role.id);
  }

  /** Remove a role by its stable key (no-op if the role or grant is absent). */
  async removeByKey(userId: string, key: string): Promise<void> {
    const role = await this.repo.findByKey(key);
    if (role) await this.repo.remove(userId, role.id);
  }

  /** Replace a user's whole role set (validates the ids exist). */
  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    for (const id of roleIds) {
      if (!(await this.repo.findById(id))) {
        throw new BadRequestException(`Unknown role id ${id}.`);
      }
    }
    await this.repo.setUserRoles(userId, roleIds);
  }

  /** User ids that currently hold ANY role granting `permission`. */
  async userIdsWithPermission(permission: Permission): Promise<string[]> {
    const roles = await this.repo.findAll();
    const granting = roles.filter((r) => r.permissions.includes(permission));
    const ids = new Set<string>();
    for (const role of granting) {
      for (const uid of await this.repo.userIdsWithRole(role.id)) ids.add(uid);
    }
    return [...ids];
  }

  // ── CRUD (admin role management — slice P3) ──────────────────────────────

  async createRole(input: {
    name: string;
    description?: string;
    permissions: Permission[];
    key?: string;
  }): Promise<RoleView> {
    const key = normalizeKey(input.key ?? input.name);
    if (!key) throw new BadRequestException('A role name/key is required.');
    if (await this.repo.findByKey(key)) {
      throw new ConflictException(`A role with key "${key}" already exists.`);
    }
    const role = await this.repo.create({
      key,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      permissions: this.sanitize(input.permissions),
      isSystem: false,
    });
    return this.viewOf(role);
  }

  async updateRole(id: string, patch: UpdateRoleInput): Promise<RoleView> {
    const role = await this.repo.findById(id);
    if (!role) throw new NotFoundException(`Role ${id} not found.`);
    // The super-admin role must always retain the full catalog (no lock-out).
    const permissions =
      role.key === SUPER_ADMIN_ROLE_KEY
        ? [...ALL_PERMISSIONS]
        : patch.permissions !== undefined
          ? this.sanitize(patch.permissions)
          : undefined;
    const updated = await this.repo.update(id, {
      name: patch.name?.trim(),
      description: patch.description?.trim(),
      permissions,
    });
    return this.viewOf(updated);
  }

  private async viewOf(role: Role): Promise<RoleView> {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
      userCount: (await this.repo.userIdsWithRole(role.id)).length,
    };
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.repo.findById(id);
    if (!role) throw new NotFoundException(`Role ${id} not found.`);
    if (role.isSystem) {
      throw new ConflictException('System roles cannot be deleted.');
    }
    await this.repo.delete(id);
  }

  private sanitize(permissions: Permission[] | undefined): Permission[] {
    return [...new Set((permissions ?? []).filter((p) => isPermission(p)))];
  }
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}
