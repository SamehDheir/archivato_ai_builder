import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PipelineProcessor } from './pipeline.processor';
import { PIPELINE_QUEUE } from './pipeline.constants';

/**
 * Async pipeline generation (BullMQ on Redis). Imports every stage module so the
 * worker can call each stage's `generate()`. InterviewModule provides the
 * ownership guard used by the controller.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT') ?? 6379),
        },
      }),
    }),
    BullModule.registerQueue({ name: PIPELINE_QUEUE }),
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, PipelineProcessor],
})
export class JobsModule {}
