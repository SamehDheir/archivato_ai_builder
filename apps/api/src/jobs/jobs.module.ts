import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { InterviewModule } from '../interview/interview.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SystemDesignModule } from '../system-design/system-design.module';
import { DatabaseDesignModule } from '../database-design/database-design.module';
import { ApiDesignModule } from '../api-design/api-design.module';
import { ReviewModule } from '../review/review.module';
import { VersionsModule } from '../versions/versions.module';
import { BillingModule } from '../billing/billing.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PipelineProcessor } from './pipeline.processor';
import { PIPELINE_QUEUE } from './pipeline.constants';
import { redisConnectionOptions } from '../common/redis.config';

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
        // Honours a managed `REDIS_URL` (credentials + TLS) and falls back to
        // host/port for local docker-compose — see `common/redis.config.ts`.
        connection: redisConnectionOptions(config),
      }),
    }),
    BullModule.registerQueue({ name: PIPELINE_QUEUE }),
    InterviewModule,
    RequirementsModule,
    SystemDesignModule,
    DatabaseDesignModule,
    ApiDesignModule,
    ReviewModule,
    VersionsModule,
    BillingModule,
    AnalyticsModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, PipelineProcessor],
})
export class JobsModule {}
