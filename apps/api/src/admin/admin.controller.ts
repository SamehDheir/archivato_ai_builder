import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  hasPermission,
  type AdminLlmUsage,
  type AdminStats,
  type AdminTraffic,
  type AdminUsersPage,
  type AuthUser,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * Platform admin dashboard API — RBAC-gated (`JwtAuthGuard` + `PermissionGuard`).
 * Reporting requires `admin:analytics` / `admin:users:read`; mutating a user
 * requires `admin:users:manage`. All held by Super Admin out of the box.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('admin:analytics')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** Headline KPIs + 30-day trend series. */
  @Get('stats')
  stats(): Promise<AdminStats> {
    return this.admin.getStats();
  }

  /** Traffic detail (daily series + top pages/referrers). */
  @Get('traffic')
  traffic(): Promise<AdminTraffic> {
    return this.admin.getTraffic();
  }

  /**
   * LLM token spend (30 days) — by stage, model, agent, and heaviest users.
   * The heaviest-spender rows are labelled with an email only for a caller who
   * also holds `admin:users:read`; otherwise they stay opaque ids.
   */
  @Get('llm-usage')
  llmUsage(@CurrentUser() me: AuthUser): Promise<AdminLlmUsage> {
    return this.admin.getLlmUsage(
      hasPermission(me.permissions, 'admin:users:read'),
    );
  }

  /**
   * Paginated users with plan + project count, and — for a caller who also holds
   * `admin:analytics` — the lifetime AI spend each user has cost us. Spend is an
   * analytics grant, so a directory-only role gets the rows without the costs.
   */
  @RequirePermissions('admin:users:read')
  @Get('users')
  users(
    @CurrentUser() me: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminUsersPage> {
    return this.admin.getUsers(
      Number(page) || 1,
      Number(pageSize) || 20,
      hasPermission(me.permissions, 'admin:analytics'),
    );
  }

  /** Promote/demote a user (never your own account — avoids self-lockout). */
  @RequirePermissions('admin:users:manage')
  @Patch('users/:id/role')
  @HttpCode(204)
  async setRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() me: AuthUser,
  ): Promise<void> {
    if (id === me.id) {
      throw new BadRequestException('You cannot change your own role.');
    }
    await this.admin.setRole(id, dto.role);
  }

  /** Delete a user (not your own account). */
  @RequirePermissions('admin:users:manage')
  @Delete('users/:id')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() me: AuthUser,
  ): Promise<void> {
    if (id === me.id) {
      throw new BadRequestException(
        'You cannot delete your own account from the admin panel.',
      );
    }
    await this.admin.deleteUser(id);
  }
}
