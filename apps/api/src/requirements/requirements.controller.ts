import { Controller, Get, Param, Post } from '@nestjs/common';
import type { RequirementDocument } from '@archivato/shared';
import { RequirementsService } from './requirements.service';

@Controller('requirements')
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  /** Generate (or regenerate) the requirement document for a confirmed session. */
  @Post(':sessionId/generate')
  generate(
    @Param('sessionId') sessionId: string,
  ): Promise<RequirementDocument> {
    return this.requirements.generate(sessionId);
  }

  /** Fetch a previously generated requirement document. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<RequirementDocument> {
    return this.requirements.get(sessionId);
  }
}
