import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isPermission, type Permission } from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRoleInput, Role, UpdateRoleInput } from './role.entity';
import type { RoleRepository } from './role.repository';

type RoleRow = Prisma.RoleGetPayload<Record<string, never>>;

/** PostgreSQL-backed RBAC store (roles + user_roles join). */
@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toRole);
  }

  async findById(id: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({ where: { id } });
    return row ? toRole(row) : null;
  }

  async findByKey(key: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({ where: { key } });
    return row ? toRole(row) : null;
  }

  async create(input: CreateRoleInput): Promise<Role> {
    const row = await this.prisma.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? '',
        permissions: input.permissions ?? [],
        isSystem: input.isSystem ?? false,
      },
    });
    return toRole(row);
  }

  async update(id: string, patch: UpdateRoleInput): Promise<Role> {
    const data: Prisma.RoleUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.permissions !== undefined) data.permissions = patch.permissions;
    const row = await this.prisma.role.update({ where: { id }, data });
    return toRole(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.role.deleteMany({ where: { id } });
  }

  async rolesForUser(userId: string): Promise<Role[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return rows.map((r) => toRole(r.role));
  }

  async assign(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }

  async remove(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }

  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    const unique = [...new Set(roleIds)];
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      this.prisma.userRole.createMany({
        data: unique.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      }),
    ]);
  }

  async userIdsWithRole(roleId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}

function toRole(r: RoleRow): Role {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    permissions: r.permissions.filter((p): p is Permission => isPermission(p)),
    isSystem: r.isSystem,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
