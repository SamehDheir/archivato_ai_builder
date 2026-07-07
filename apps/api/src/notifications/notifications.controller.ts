import {
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser, NotificationsPage } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

/**
 * The signed-in user's in-app notifications (bell/inbox). Every route is scoped
 * to the current user by the token — a user only ever sees or mutates their own.
 */
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Recent notifications + unread count (drives the bell). */
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<NotificationsPage> {
    return this.notifications.page(user.id);
  }

  /** Mark every notification read; returns the refreshed page. */
  @Post('read-all')
  @HttpCode(200)
  async markAll(@CurrentUser() user: AuthUser): Promise<NotificationsPage> {
    await this.notifications.markAllRead(user.id);
    return this.notifications.page(user.id);
  }

  /** Mark one notification read (idempotent; scoped to the caller). */
  @Patch(':id/read')
  @HttpCode(204)
  async markOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.notifications.markRead(user.id, id);
  }
}
