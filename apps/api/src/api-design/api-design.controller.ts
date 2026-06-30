import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { ApiDesign } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { ApiDesignService } from './api-design.service';
import { UpdateApiDesignDto } from './dto/update-api-design.dto';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
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

  /** Save user edits to the API design. */
  @Put(':sessionId')
  update(
    @Param('sessionId') sessionId: string,
    @Body() body: UpdateApiDesignDto,
  ): Promise<ApiDesign> {
    return this.apiDesign.save(sessionId, body);
  }
}
