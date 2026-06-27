import { Controller, Get, Param, Post } from '@nestjs/common';
import type { SystemDesign } from '@archivato/shared';
import { SystemDesignService } from './system-design.service';

@Controller('system-design')
export class SystemDesignController {
  constructor(private readonly systemDesign: SystemDesignService) {}

  /** Generate (or regenerate) the system design for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<SystemDesign> {
    return this.systemDesign.generate(sessionId);
  }

  /** Fetch a previously generated system design. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<SystemDesign> {
    return this.systemDesign.get(sessionId);
  }
}
