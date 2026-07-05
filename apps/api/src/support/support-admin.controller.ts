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
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupportService } from './support.service';
import { SupportAiService } from './support-ai.service';
import { parseFilter } from './support.controller';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { InternalNoteDto } from './dto/internal-note.dto';

/**
 * Support staff API — RBAC-gated (`JwtAuthGuard` + `PermissionGuard`). Reading
 * requires `support:read_all`; write actions require the matching permission
 * (`support:manage`/`:note`/`:copilot`). Held by the Support Agent + Super Admin
 * roles out of the box, but assignable to any custom role.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions('support:read_all')
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

  /**
   * Change status / priority / category / assignee (each a timeline event).
   * Only `support:read_all` is required to reach this route; the service then
   * enforces the per-axis permission (`support:manage` for status/priority/
   * category, `support:assign` for assignment), so a role holding just one can
   * do just that.
   */
  @Patch('tickets/:id')
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ): Promise<SupportTicketDetail> {
    return this.support.adminUpdateTicket(admin, id, dto);
  }

  /** Add a private internal note. */
  @RequirePermissions('support:read_all', 'support:note')
  @Post('tickets/:id/notes')
  addNote(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: InternalNoteDto,
  ): Promise<SupportTicketDetail> {
    return this.support.addInternalNote(admin, id, dto.body);
  }

  /** AI Copilot: full analysis + urgency, priority, assignment, similar tickets. */
  @RequirePermissions('support:read_all', 'support:copilot')
  @Post('tickets/:id/ai/copilot')
  @HttpCode(200)
  copilot(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportAiAnalysis> {
    return this.ai.copilot(admin, id);
  }
}
