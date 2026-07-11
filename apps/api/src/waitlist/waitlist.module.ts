import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WaitlistController } from './waitlist.controller';
import { WaitlistAdminController } from './waitlist-admin.controller';
import { WaitlistService } from './waitlist.service';
import { WAITLIST_REPOSITORY } from './waitlist.repository';
import { PrismaWaitlistRepository } from './prisma-waitlist.repository';

/**
 * Waitlist: a public signup endpoint for the marketing landing page + an
 * RBAC-gated admin list. Follows the repository pattern (in-memory impl backs
 * tests; Prisma impl backs the app). Imports AuthModule for the guards the
 * admin controller uses (PermissionGuard + JwtAuthGuard).
 */
@Module({
  imports: [AuthModule],
  controllers: [WaitlistController, WaitlistAdminController],
  providers: [
    WaitlistService,
    { provide: WAITLIST_REPOSITORY, useClass: PrismaWaitlistRepository },
  ],
  exports: [WaitlistService],
})
export class WaitlistModule {}
