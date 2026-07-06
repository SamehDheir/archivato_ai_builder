import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  AuthUser,
  KbArticleRef,
  SupportAiAnalysis,
  SupportCustomerStats,
  SupportDeflectionResult,
  SupportTicketDetail,
  SupportTicketFilter,
  SupportTicketList,
} from '@archivato/shared';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { THROTTLE_AI } from '../common/throttling';
import { SupportService } from './support.service';
import { SupportAiService } from './support-ai.service';
import { KNOWLEDGE_BASE, getKnowledgeArticle } from './support-knowledge-base';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyDto } from './dto/reply.dto';
import { AskAiDto } from './dto/ask-ai.dto';
import { AddAttachmentDto } from './dto/add-attachment.dto';

/**
 * Customer-facing Support Center API. Every route requires an authenticated
 * user; the service scopes tickets to the caller (an admin may also read/reply
 * here — cross-cutting checks live in the service). Support is FREE for all
 * users (no Pro gate), including the AI assistant.
 */
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly ai: SupportAiService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('stats')
  stats(@CurrentUser() user: AuthUser): Promise<SupportCustomerStats> {
    return this.support.customerStats(user);
  }

  // ── Knowledge Base (placeholder content the AI also uses) ──────────────────

  @Get('kb')
  kb(): { articles: KbArticleRef[] } {
    return {
      articles: KNOWLEDGE_BASE.map((a) => ({
        id: a.id,
        title: a.title,
        excerpt: a.body.length > 180 ? `${a.body.slice(0, 177)}…` : a.body,
      })),
    };
  }

  @Get('kb/:id')
  kbArticle(@Param('id') id: string): { article: KbArticleRef | null; body: string | null } {
    const a = getKnowledgeArticle(id);
    return a
      ? { article: { id: a.id, title: a.title, excerpt: a.body }, body: a.body }
      : { article: null, body: null };
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  @Get('tickets')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, string>,
  ): Promise<SupportTicketList> {
    return this.support.listMyTickets(user, parseFilter(query));
  }

  @Post('tickets')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTicketDto,
  ): Promise<SupportTicketDetail> {
    return this.support.createTicket(user, dto);
  }

  @Get('tickets/:id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportTicketDetail> {
    return this.support.getTicketDetail(user, id);
  }

  @Post('tickets/:id/reply')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ): Promise<SupportTicketDetail> {
    return this.support.reply(user, id, dto.body);
  }

  @Post('tickets/:id/close')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportTicketDetail> {
    return this.support.closeTicket(user, id);
  }

  @Post('tickets/:id/reopen')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportTicketDetail> {
    return this.support.reopenTicket(user, id);
  }

  @Post('tickets/:id/attachments')
  addAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddAttachmentDto,
  ): Promise<SupportTicketDetail> {
    return this.support.addAttachment(user, id, dto);
  }

  // ── AI assistant ─────────────────────────────────────────────────────────

  /** Pre-ticket deflection: analyze the issue and suggest a solution. */
  @Post('ai/deflect')
  @HttpCode(200)
  @Throttle(THROTTLE_AI)
  deflect(
    @CurrentUser() user: AuthUser,
    @Body() dto: AskAiDto,
  ): Promise<SupportDeflectionResult> {
    return this.ai.deflect(user, dto);
  }

  /** In-ticket assistant: summarize, root-cause, and draft a fix + reply. */
  @Post('tickets/:id/ai/analyze')
  @HttpCode(200)
  @Throttle(THROTTLE_AI)
  analyze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<SupportAiAnalysis> {
    return this.ai.analyzeTicket(user, id);
  }
}

/** Translate raw query params into a typed, bounded filter. */
export function parseFilter(query: Record<string, string>): SupportTicketFilter {
  return {
    status: query.status as SupportTicketFilter['status'],
    priority: query.priority as SupportTicketFilter['priority'],
    category: query.category as SupportTicketFilter['category'],
    search: query.search,
    assigneeId: query.assigneeId,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
