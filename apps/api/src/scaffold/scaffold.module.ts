import { Module } from '@nestjs/common';
import { ExportModule } from '../export/export.module';
import { InterviewModule } from '../interview/interview.module';
import { BillingModule } from '../billing/billing.module';
import { TokenCipher } from '../common/token-cipher';
import { ScaffoldController } from './scaffold.controller';
import { ScaffoldService } from './scaffold.service';
import { GithubConnectionController } from './github-connection.controller';
import { GithubConnectionService } from './github-connection.service';
import { GithubOAuthService } from './github-oauth.service';
import { GITHUB_CONNECTION_REPOSITORY } from './github-connection.repository';
import { PrismaGithubConnectionRepository } from './prisma-github-connection.repository';

/**
 * Code scaffolding (Pro). Reuses ExportService for the assembled design bundle;
 * imports Interview + Billing so the SessionOwnerGuard and ProGuard resolve.
 * Also owns the stored GitHub connection (encrypted token) for one-click push.
 */
@Module({
  imports: [ExportModule, InterviewModule, BillingModule],
  controllers: [ScaffoldController, GithubConnectionController],
  providers: [
    ScaffoldService,
    GithubConnectionService,
    GithubOAuthService,
    TokenCipher,
    {
      provide: GITHUB_CONNECTION_REPOSITORY,
      useClass: PrismaGithubConnectionRepository,
    },
  ],
})
export class ScaffoldModule {}
