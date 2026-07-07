import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hasPermission } from '@archivato/shared';
import type {
  AuthUser,
  SimilarTicketRef,
  SupportAiAnalysis,
  SupportAskAiInput,
  SupportAuthorType,
  SupportDeflectionResult,
} from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { SupportAssistantAgent } from '../llm/agents/support-assistant.agent';
import type { SupportProjectContext } from '../llm/agents/support-assistant.agent';
import {
  SUPPORT_REPOSITORY,
  type SupportRepository,
} from './support.repository';
import { KbService } from './kb.service';
import { SupportNotificationsService } from './support-notifications.service';
import type {
  SupportTicketBundle,
  SupportTicketRecord,
} from './support.entities';

/** How many recent tickets to scan when scoring "similar tickets". */
const SIMILARITY_SCAN = 40;

/**
 * Orchestrates the three AI Support layers on top of `SupportAssistantAgent`:
 *   • deflect       — pre-ticket, over the user's OWN history + the KB.
 *   • analyzeTicket — in-ticket assistant (owner or admin).
 *   • copilot       — admin power layer (similar tickets across the system).
 *
 * Security: for a customer, "similar tickets" are drawn ONLY from that
 * customer's own tickets — the AI never sees another user's data. Admins may
 * search the whole system. Results are persisted (suggestions / interactions)
 * for the timeline + history.
 */
@Injectable()
export class SupportAiService {
  constructor(
    @Inject(SUPPORT_REPOSITORY) private readonly repo: SupportRepository,
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    private readonly agent: SupportAssistantAgent,
    private readonly kb: KbService,
    private readonly notifications: SupportNotificationsService,
  ) {}

  // ── Layer 1: pre-ticket deflection ──────────────────────────────────────

  async deflect(
    user: AuthUser,
    dto: SupportAskAiInput,
  ): Promise<SupportDeflectionResult> {
    const articles = await this.kb.searchForDeflection(dto.message, 3);
    const similarTickets = await this.findSimilar(
      user.id,
      dto.message,
      null,
    );
    const project = await this.projectContext(user, dto.sessionId);

    const result = await this.agent.deflect({
      message: dto.message,
      project,
      articles,
      similarTickets,
    });

    // Best-effort log (never break the flow if it fails).
    await this.repo
      .addAiInteraction({
        id: randomUUID(),
        userId: user.id,
        kind: 'deflection',
        query: dto.message,
        response: result as unknown as Record<string, unknown>,
        deflected: result.solved,
        createdAt: new Date(),
      })
      .catch(() => undefined);

    return result;
  }

  // ── Layer 2: in-ticket assistant ─────────────────────────────────────────

  async analyzeTicket(
    user: AuthUser,
    ticketId: string,
  ): Promise<SupportAiAnalysis> {
    const bundle = await this.loadForAccess(user, ticketId);
    const analysis = await this.agent.analyze(
      await this.analysisContext(bundle, []),
    );
    await this.persistSuggestion(user, ticketId, 'in_ticket', analysis);
    return analysis;
  }

  // ── Layer 3: admin copilot ────────────────────────────────────────────────

  async copilot(admin: AuthUser, ticketId: string): Promise<SupportAiAnalysis> {
    const bundle = await this.repo.findTicketBundle(ticketId);
    if (!bundle) throw new NotFoundException(`Support ticket ${ticketId} not found.`);

    const similar = await this.findSimilar(
      null,
      `${bundle.ticket.subject} ${bundle.messages.map((m) => m.body).join(' ')}`,
      ticketId,
    );
    const analysis = await this.agent.copilot(
      await this.analysisContext(bundle, similar),
    );
    await this.persistSuggestion(admin, ticketId, 'admin_copilot', analysis);

    // If the copilot judges the ticket critical, raise a smart alert (placeholder).
    if (analysis.suggestedPriority === 'critical') {
      await this.notifications
        .smartAlert('critical_issue', bundle.ticket, 'critical')
        .catch(() => undefined);
    }
    return analysis;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async loadForAccess(
    user: AuthUser,
    ticketId: string,
  ): Promise<SupportTicketBundle> {
    const bundle = await this.repo.findTicketBundle(ticketId);
    if (!bundle) throw new NotFoundException(`Support ticket ${ticketId} not found.`);
    const isStaff = hasPermission(user.permissions, 'support:read_all');
    if (!isStaff && bundle.ticket.userId !== user.id) {
      // 404, not 403 — no existence leak (mirrors SupportService).
      throw new NotFoundException(`Support ticket ${ticketId} not found.`);
    }
    return bundle;
  }

  private async analysisContext(
    bundle: SupportTicketBundle,
    similarTickets: SimilarTicketRef[],
  ) {
    const { ticket, messages, attachments } = bundle;
    const logs = attachments
      .filter((a) => a.textContent)
      .map((a) => `${a.filename}:\n${a.textContent}`);
    const project = await this.projectContextForSession(ticket.sessionId);
    return {
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      conversation: messages
        .filter((m) => m.authorType !== 'system')
        .map((m) => ({
          author: m.authorType as SupportAuthorType,
          body: m.body,
        })),
      logs,
      project,
      similarTickets,
    };
  }

  private async persistSuggestion(
    actor: AuthUser,
    ticketId: string,
    layer: 'in_ticket' | 'admin_copilot',
    analysis: SupportAiAnalysis,
  ): Promise<void> {
    await this.repo.addAiSuggestion({
      id: randomUUID(),
      ticketId,
      layer,
      data: analysis as unknown as Record<string, unknown>,
      createdAt: new Date(),
    });
    await this.repo.addEvent({
      id: randomUUID(),
      ticketId,
      type: 'ai_suggestion',
      actorType: 'ai',
      actorId: null,
      data: { layer, by: actor.id },
      createdAt: new Date(),
    });
  }

  /**
   * Score recent tickets in scope by token overlap with `text`; return the top
   * matches. `ownerId=null` = whole system (admin copilot); a user id = only
   * that customer's tickets (deflection — never leaks other users' data).
   */
  private async findSimilar(
    ownerId: string | null,
    text: string,
    excludeId: string | null,
  ): Promise<SimilarTicketRef[]> {
    const { rows } = await this.repo.listTickets({
      ownerId,
      page: 1,
      pageSize: SIMILARITY_SCAN,
    });
    const tokens = tokenize(text);
    if (!tokens.size) return [];

    return rows
      .filter((r) => r.id !== excludeId)
      .map((r) => ({ r, score: overlap(tokens, tokenize(r.subject)) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ r }) => this.toRef(r));
  }

  private toRef(r: SupportTicketRecord): SimilarTicketRef {
    return { id: r.id, number: r.number, subject: r.subject, status: r.status };
  }

  private async projectContext(
    user: AuthUser,
    sessionId?: string,
  ): Promise<SupportProjectContext | null> {
    if (!sessionId) return null;
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== user.id) return null;
    return this.buildProjectContext(session);
  }

  private async projectContextForSession(
    sessionId: string | null,
  ): Promise<SupportProjectContext | null> {
    if (!sessionId) return null;
    const session = await this.sessions.findById(sessionId);
    return session ? this.buildProjectContext(session) : null;
  }

  private buildProjectContext(session: {
    title: string | null;
    input: { idea: string };
    intent: { summary?: string } | null;
  }): SupportProjectContext {
    return {
      title: session.title || session.input.idea,
      summary: session.intent?.summary,
    };
  }
}

// ── module-local text helpers ──────────────────────────────────────────────

const STOP = new Set([
  'the', 'and', 'for', 'you', 'your', 'that', 'this', 'with', 'have', 'not',
  'are', 'was', 'can', 'cannot', 'when', 'what', 'how', 'why', 'from',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of b) if (a.has(t)) n++;
  return n;
}
