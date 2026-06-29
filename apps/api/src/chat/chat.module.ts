import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { RefinementAgent } from '../llm/agents/refinement.agent';
import { ChatController } from './chat.controller';
import { RefinementService } from './refinement.service';
import { CHAT_MESSAGE_REPOSITORY } from './chat-message.repository';
import { PrismaChatMessageRepository } from './prisma-chat-message.repository';

/**
 * Post-generation AI chat (Slice 10). Reuses every stage's service so a chat
 * instruction can amend the requirements and cascade through the whole design.
 */
@Module({
  imports: [
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
  ],
  controllers: [ChatController],
  providers: [
    RefinementService,
    RefinementAgent,
    {
      provide: CHAT_MESSAGE_REPOSITORY,
      useClass: PrismaChatMessageRepository,
    },
  ],
})
export class ChatModule {}
