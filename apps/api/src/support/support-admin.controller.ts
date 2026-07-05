import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthUser,
  SupportAdminStats,
  SupportAgentRef,
  SupportAiAnalysis,
  SupportTicketDetail,
  SupportTicketList,
} from '@archivato/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupportService } from './support.service';
import { SupportAiService } from './support-ai.service';
import { parseFilter } from './support.controller';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { InternalNoteDto } from './dto/internal-note.dto';

/**
 * Admin Support Panel API — every route requires an authenticated `admin`
 * (`JwtAuthGuard` then `AdminGuard`). Admins see and act on every ticket, add
 * internal notes, (re)assign, and use the AI Copilot.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('support/admin')
export class SupportAdminController {
  constructor(
    private readonly support: SupportService,
    private readonly ai: SupportAiService,
  ) {}

  /** Admin support dashboard metrics. */
  @Get('stats')
  stats(): Promise<SupportAdminStats> {
    return this.support.adminStats();
  }

  /** Assignable admins (assignment dropdown). */
  @Get('agents')
  agents(): Promise<SupportAgentRef[]> {
    return this.support.listAgents();
  }

  /** Every ticket in the system (filtered, searched, paginated). */
  @Get('tickets')
  list(@Query() query: Record<string, string>): Promise<SupportTicketList> {
    return this.support.listAllTickets(parseFilter(query));
  }

  /** Full ticket detail incl. internal notes (admin scope). */
  @Get('tickets/:id')
  detail(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportTicketDetail> {
    return this.support.getTicketDetail(admin, id);
  }

  /** Change status / priority / category / assignee (each a timeline event). */
  @Patch('tickets/:id')
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<SupportTicketDetail> {
    return this.support.adminUpdateTicket(admin, id, dto);
  }

  /** Add a private internal note. */
  @Post('tickets/:id/notes')
  addNote(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: InternalNoteDto,
  ): Promise<SupportTicketDetail> {
    return this.support.addInternalNote(admin, id, dto.body);
  }

  /** AI Copilot: full analysis + urgency, priority, assignment, similar tickets. */
  @Post('tickets/:id/ai/copilot')
  @HttpCode(200)
  copilot(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportAiAnalysis> {
    return this.ai.copilot(admin, id);
  }
}
