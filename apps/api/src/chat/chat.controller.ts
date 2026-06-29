import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { ChatMessage, RefineResult } from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionOwnerGuard } from '../interview/session-owner.guard';
import { RefinementService } from './refinement.service';
import { RefineDto } from './dto/refine.dto';

@UseGuards(JwtAuthGuard, SessionOwnerGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly refinement: RefinementService) {}

  /** Apply a chat instruction and return the updated artifacts + transcript. */
  @Post(':sessionId')
  refine(
    @Param('sessionId') sessionId: string,
    @Body() dto: RefineDto,
  ): Promise<RefineResult> {
    return this.refinement.refine(sessionId, dto.instruction);
  }

  /** Fetch the saved conversation for a session. */
  @Get(':sessionId')
  messages(@Param('sessionId') sessionId: string): Promise<ChatMessage[]> {
    return this.refinement.getMessages(sessionId);
  }
}
