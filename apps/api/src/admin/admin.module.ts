import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * SuperAdmin dashboard: read-only reporting over users/projects/subscriptions
 * plus analytics events. Imports AuthModule (USER_REPOSITORY + AdminGuard) and
 * AnalyticsModule (event aggregation). PrismaService is global.
 */
@Module({
  imports: [AuthModule, AnalyticsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
