import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { WaitlistSignupResult } from '@archivato/shared';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { THROTTLE_WAITLIST } from '../common/throttling';
import { resolveCountryFromRequest } from '../common/geo';

/**
 * Public waitlist signup. Fired from the marketing landing page, so this route
 * is intentionally unguarded. Signup is idempotent (a duplicate email succeeds),
 * and the DTO validates + caps the input.
 */
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @HttpCode(200)
  @Throttle(THROTTLE_WAITLIST)
  join(
    @Body() dto: JoinWaitlistDto,
    @Req() req: Request,
  ): Promise<WaitlistSignupResult> {
    return this.waitlist.join(dto, resolveCountryFromRequest(req));
  }
}
