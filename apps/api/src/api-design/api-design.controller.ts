import { Controller, Get, Param, Post } from '@nestjs/common';
import type { ApiDesign } from '@archivato/shared';
import { ApiDesignService } from './api-design.service';

@Controller('api-design')
export class ApiDesignController {
  constructor(private readonly apiDesign: ApiDesignService) {}

  /** Generate (or regenerate) the API design for a session. */
  @Post(':sessionId/generate')
  generate(@Param('sessionId') sessionId: string): Promise<ApiDesign> {
    return this.apiDesign.generate(sessionId);
  }

  /** Fetch a previously generated API design. */
  @Get(':sessionId')
  get(@Param('sessionId') sessionId: string): Promise<ApiDesign> {
    return this.apiDesign.get(sessionId);
  }
}
