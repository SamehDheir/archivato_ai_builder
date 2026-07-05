import { Module } from '@nestjs/common';
import { ROLE_REPOSITORY } from './role.repository';
import { PrismaRoleRepository } from './prisma-role.repository';
import { RoleService } from './role.service';

/**
 * RBAC roles module. Owns the role store + `RoleService` (seeding, permission
 * resolution, assignment, CRUD). Imports nothing from AuthModule (one-way:
 * AuthModule imports this to enrich the AuthUser), so there's no cycle. Prisma is
 * global.
 */
@Module({
  providers: [
    RoleService,
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
  ],
  exports: [RoleService, ROLE_REPOSITORY],
})
export class RolesModule {}
