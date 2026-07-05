import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { CreateRoleInput, Role, UpdateRoleInput } from './role.entity';
import type { RoleRepository } from './role.repository';

/** In-memory RBAC store — backs unit tests (DB-free); mirrors the Prisma impl. */
export class InMemoryRoleRepository implements RoleRepository {
  private roles: Role[] = [];
  private assignments: { userId: string; roleId: string }[] = [];

  async findAll(): Promise<Role[]> {
    return this.roles.map((r) => ({ ...r, permissions: [...r.permissions] }));
  }

  async findById(id: string): Promise<Role | null> {
    const r = this.roles.find((x) => x.id === id);
    return r ? { ...r, permissions: [...r.permissions] } : null;
  }

  async findByKey(key: string): Promise<Role | null> {
    const r = this.roles.find((x) => x.key === key);
    return r ? { ...r, permissions: [...r.permissions] } : null;
  }

  async create(input: CreateRoleInput): Promise<Role> {
    const now = new Date();
    const role: Role = {
      id: randomUUID(),
      key: input.key,
      name: input.name,
      description: input.description ?? '',
      permissions: input.permissions ? [...input.permissions] : [],
      isSystem: input.isSystem ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.roles.push(role);
    return { ...role, permissions: [...role.permissions] };
  }

  async update(id: string, patch: UpdateRoleInput): Promise<Role> {
    const r = this.roles.find((x) => x.id === id);
    if (!r) throw new NotFoundException(`Role ${id} not found.`);
    if (patch.name !== undefined) r.name = patch.name;
    if (patch.description !== undefined) r.description = patch.description;
    if (patch.permissions !== undefined) r.permissions = [...patch.permissions];
    r.updatedAt = new Date();
    return { ...r, permissions: [...r.permissions] };
  }

  async delete(id: string): Promise<void> {
    this.roles = this.roles.filter((r) => r.id !== id);
    this.assignments = this.assignments.filter((a) => a.roleId !== id);
  }

  async rolesForUser(userId: string): Promise<Role[]> {
    const ids = this.assignments
      .filter((a) => a.userId === userId)
      .map((a) => a.roleId);
    return this.roles
      .filter((r) => ids.includes(r.id))
      .map((r) => ({ ...r, permissions: [...r.permissions] }));
  }

  async assign(userId: string, roleId: string): Promise<void> {
    if (!this.assignments.some((a) => a.userId === userId && a.roleId === roleId)) {
      this.assignments.push({ userId, roleId });
    }
  }

  async remove(userId: string, roleId: string): Promise<void> {
    this.assignments = this.assignments.filter(
      (a) => !(a.userId === userId && a.roleId === roleId),
    );
  }

  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    this.assignments = this.assignments.filter((a) => a.userId !== userId);
    for (const roleId of new Set(roleIds)) {
      this.assignments.push({ userId, roleId });
    }
  }

  async userIdsWithRole(roleId: string): Promise<string[]> {
    return this.assignments
      .filter((a) => a.roleId === roleId)
      .map((a) => a.userId);
  }
}
