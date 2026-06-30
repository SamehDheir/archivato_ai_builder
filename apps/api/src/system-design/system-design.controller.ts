import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { SystemDesign } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { SystemDesignService } from './system-design.service';
import { UpdateSystemDesignDto } from './dto/update-system-design.dto';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
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

  /** Save user edits to the system design. */
  @Put(':sessionId')
  update(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateSystemDesignDto,
  ): Promise<SystemDesign> {
    return this.systemDesign.save(sessionId, body);
  }
}
