import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InterviewModule } from '../interview/interview.module';
import { BillingModule } from '../billing/billing.module';
import { RolesModule } from '../roles/roles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportController } from './support.controller';
import { SupportAdminController } from './support-admin.controller';
import { KbController } from './kb.controller';
import { KbAdminController } from './kb-admin.controller';
import { SupportService } from './support.service';
import { SupportAiService } from './support-ai.service';
import { KbService } from './kb.service';
import { SupportNotificationsService } from './support-notifications.service';
import { SupportAssistantAgent } from '../llm/agents/support-assistant.agent';
import { SUPPORT_REPOSITORY } from './support.repository';
import { PrismaSupportRepository } from './prisma-support.repository';
import { KB_REPOSITORY } from './kb.repository';
import { PrismaKbRepository } from './prisma-kb.repository';

/**
 * Customer Support Center: a professional ticketing system with an embedded
 * three-layer AI Support Assistant (pre-ticket deflection, in-ticket assistant,
 * admin copilot). Imports AuthModule (USER_REPOSITORY + guards), InterviewModule
 * (related-project lookup) and BillingModule (customer plan). The LLM provider is
 * global, so the SupportAssistantAgent is provided here directly.
 */
@Module({
  imports: [AuthModule, InterviewModule, BillingModule, RolesModule, NotificationsModule],
  controllers: [
    SupportController,
    SupportAdminController,
    KbController,
    KbAdminController,
  ],
  providers: [
    SupportService,
    SupportAiService,
    KbService,
    SupportNotificationsService,
    SupportAssistantAgent,
    { provide: SUPPORT_REPOSITORY, useClass: PrismaSupportRepository },
    { provide: KB_REPOSITORY, useClass: PrismaKbRepository },
  ],
  exports: [SUPPORT_REPOSITORY, SupportService],
})
export class SupportModule {}
