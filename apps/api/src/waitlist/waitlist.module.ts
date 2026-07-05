import { Module } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { WAITLIST_REPOSITORY } from './waitlist.repository';
import { PrismaWaitlistRepository } from './prisma-waitlist.repository';

/**
 * Waitlist: a public signup endpoint for the marketing landing page. Follows the
 * repository pattern (in-memory impl backs tests; Prisma impl backs the app).
 */
@Module({
  controllers: [WaitlistController],
  providers: [
    WaitlistService,
    { provide: WAITLIST_REPOSITORY, useClass: PrismaWaitlistRepository },
  ],
  exports: [WaitlistService],
})
export class WaitlistModule {}
