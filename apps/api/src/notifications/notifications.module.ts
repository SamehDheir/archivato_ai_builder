import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_REPOSITORY } from './notification.repository';
import { PrismaNotificationRepository } from './prisma-notification.repository';

/**
 * In-app notifications (bell/inbox). Imports AuthModule for the JWT guard.
 * Exports `NotificationsService` so feature modules (e.g. Support) can create
 * notifications for a recipient.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
