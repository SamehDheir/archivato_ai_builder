import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { LlmUsageModule } from '../llm/usage/llm-usage.module';
import { RolesModule } from '../roles/roles.module';
import { AdminController } from './admin.controller';
import { AdminRolesController } from './admin-roles.controller';
import { AdminService } from './admin.service';

/**
 * SuperAdmin dashboard: read-only reporting over users/projects/subscriptions
 * plus analytics events and LLM spend. Imports AuthModule (USER_REPOSITORY +
 * AdminGuard), AnalyticsModule (event aggregation), and LlmUsageModule (token
 * spend). PrismaService is global.
 */
@Module({
  imports: [AuthModule, AnalyticsModule, LlmUsageModule, RolesModule],
  controllers: [AdminController, AdminRolesController],
  providers: [AdminService],
})
export class AdminModule {}
