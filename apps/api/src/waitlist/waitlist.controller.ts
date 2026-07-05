import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { WaitlistSignupResult } from '@archivato/shared';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

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
  join(@Body() dto: JoinWaitlistDto): Promise<WaitlistSignupResult> {
    return this.waitlist.join(dto);
  }
}
