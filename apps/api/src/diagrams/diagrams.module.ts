import { Module } from '@nestjs/common';
import { InterviewModule } from '../interview/interview.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { DiagramsController } from './diagrams.controller';
import { DiagramsService } from './diagrams.service';

/**
 * Architecture diagrams (Mermaid). Reads the design artifacts from their stores
 * (no LLM — pure deterministic builders). InterviewModule provides the owner
 * guard + session store.
 */
@Module({
  imports: [
    InterviewModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
  ],
  controllers: [DiagramsController],
  providers: [DiagramsService],
})
export class DiagramsModule {}
