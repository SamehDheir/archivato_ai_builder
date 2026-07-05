import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser, ProvisionedUser, RoleView } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { RoleService } from '../roles/role.service';
import { CreateRoleDto } from '../roles/dto/create-role.dto';
import { UpdateRoleDto } from '../roles/dto/update-role.dto';
import { SetUserRolesDto } from '../roles/dto/set-user-roles.dto';
import { ProvisionUserDto } from './dto/provision-user.dto';

/**
 * RBAC role-management API. Requires `admin:roles:manage` (held by Super Admin).
 * Create/edit/delete roles, toggle their permissions, and assign roles to users.
 * The permission *catalog* is code-defined — the client reads it from
 * `@archivato/shared` (`PERMISSION_CATALOG`), so there's no endpoint for it.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('admin:roles:manage')
@Controller('admin/roles')
export class AdminRolesController {
  constructor(
    private readonly roles: RoleService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Provision a staff account (email + generated password), no self-registration.
   * The generated password is returned once for the admin to hand off. Requires
   * `admin:roles:manage` (Super Admin) — see the controller-level guard.
   */
  @Post('provision-user')
  provisionUser(@Body() dto: ProvisionUserDto): Promise<ProvisionedUser> {
    return this.auth.provisionStaff(dto);
  }

  /** All roles with their user counts. */
  @Get()
  list(): Promise<RoleView[]> {
    return this.roles.roleViews();
  }

  /** Create a custom role. */
  @Post()
  create(@Body() dto: CreateRoleDto): Promise<RoleView> {
    return this.roles.createRole(dto);
  }

  /** Edit a role's name / description / permissions. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto): Promise<RoleView> {
    return this.roles.updateRole(id, dto);
  }

  /** Delete a custom role (system roles are protected). */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.roles.deleteRole(id);
  }

  /** The role ids currently assigned to a user (for the assignment editor). */
  @Get('user/:userId')
  async userRoles(@Param('userId') userId: string): Promise<{ roleIds: string[] }> {
    return { roleIds: await this.roles.roleIdsForUser(userId) };
  }

  /** Replace a user's whole role set. You can't edit your own (avoids lock-out). */
  @Put('user/:userId')
  @HttpCode(204)
  async setUserRoles(
    @Param('userId') userId: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() me: AuthUser,
  ): Promise<void> {
    if (userId === me.id) {
      throw new BadRequestException(
        'You cannot change your own roles here — ask another admin.',
      );
    }
    await this.roles.setUserRoles(userId, dto.roleIds);
  }
}
