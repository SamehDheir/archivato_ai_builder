import type { CreateRoleInput, Role, UpdateRoleInput } from './role.entity';

/** DI token for the role store. */
export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

/**
 * Persistence seam for RBAC roles + their assignment to users (Repository
 * pattern). In-memory impl backs the unit tests; Prisma impl backs the app.
 */
export interface RoleRepository {
  // Roles --------------------------------------------------------------------
  findAll(): Promise<Role[]>;
  findById(id: string): Promise<Role | null>;
  findByKey(key: string): Promise<Role | null>;
  create(input: CreateRoleInput): Promise<Role>;
  update(id: string, patch: UpdateRoleInput): Promise<Role>;
  delete(id: string): Promise<void>;

  // Assignment ---------------------------------------------------------------
  /** Roles currently assigned to a user (source of their permissions). */
  rolesForUser(userId: string): Promise<Role[]>;
  /** Idempotently assign a role to a user. */
  assign(userId: string, roleId: string): Promise<void>;
  /** Remove a role from a user (no-op if not assigned). */
  remove(userId: string, roleId: string): Promise<void>;
  /** Replace a user's whole role set with the given role ids. */
  setUserRoles(userId: string, roleIds: string[]): Promise<void>;
  /** Ids of users who hold a given role (for the assignee/agent lookups). */
  userIdsWithRole(roleId: string): Promise<string[]>;
}
