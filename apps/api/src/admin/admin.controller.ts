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
import type {
  AdminStats,
  AdminTraffic,
  AdminUsersPage,
  AuthUser,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdminService } from './admin.service';
import { UpdateRoleDto } from './dto/update-role.dto';

/**
 * SuperAdmin dashboard API. Every route requires an authenticated user with the
 * `admin` role (`JwtAuthGuard` then `AdminGuard` → 403 otherwise).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
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

  /** Paginated users with plan + project count. */
  @Get('users')
  users(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<AdminUsersPage> {
    return this.admin.getUsers(Number(page) || 1, Number(pageSize) || 20);
  }

  /** Promote/demote a user (never your own account — avoids self-lockout). */
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
