import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AuthUser,
  CreateSupportTicketInput,
  Permission,
  SupportAdminStats,
  SupportCustomerInfo,
  SupportCustomerStats,
  SupportRelatedProject,
  SupportTicketDetail,
  SupportTicketFilter,
  SupportTicketList,
  SupportTicketStatus,
} from '@archivato/shared';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  hasPermission,
} from '@archivato/shared';
import {
  INTERVIEW_SESSION_REPOSITORY,
  type InterviewSessionRepository,
} from '../interview/interview-session.repository';
import { USER_REPOSITORY, type UserRepository } from '../auth/user.repository';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoleService } from '../roles/role.service';
import type { SupportAgentRef } from '@archivato/shared';
import {
  SUPPORT_REPOSITORY,
  type SupportRepository,
} from './support.repository';
import { SupportNotificationsService } from './support-notifications.service';
import type {
  SupportEventRecord,
  SupportListQuery,
  SupportTicketBundle,
  SupportTicketRecord,
} from './support.entities';
import {
  toAiSuggestion,
  toAttachment,
  toEvent,
  toMessage,
  toNote,
  toTicketSummary,
  type SupportNameLookup,
} from './support.mapper';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Core Support Center logic: tickets, conversation, timeline events, internal
 * notes, attachments, and status transitions. Authorization lives here — a
 * customer may only touch their own tickets; an admin may touch any. The AI
 * layers live in `SupportAiService`; reporting stats are computed from the
 * repository.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(SUPPORT_REPOSITORY) private readonly repo: SupportRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INTERVIEW_SESSION_REPOSITORY)
    private readonly sessions: InterviewSessionRepository,
    private readonly billing: BillingService,
    private readonly notifications: SupportNotificationsService,
    private readonly prisma: PrismaService,
    private readonly roles: RoleService,
  ) {}

  /** Staff who can be assigned a ticket — anyone with `support:read_all`. */
  async listAgents(): Promise<SupportAgentRef[]> {
    const ids = await this.roles.userIdsWithPermission('support:read_all');
    if (ids.length === 0) return [];
    const agents = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: 'asc' },
    });
    return agents.map((a) => ({ id: a.id, name: a.displayName, email: a.email }));
  }

  /** Whether the user acts as support staff (drives author/actor typing). */
  private isStaff(user: AuthUser): boolean {
    return hasPermission(user.permissions, 'support:read_all');
  }

  /**
   * Fine-grained gate for a staff action on a ticket the user does NOT own.
   * `support:read_all` grants read access to every ticket, but each write action
   * needs its own permission (reply / manage / assign / note) — so a role scoped
   * to "view all tickets" can look but not touch. Throws 403 when missing.
   */
  private requirePermission(
    user: AuthUser,
    permission: Permission,
    message: string,
  ): void {
    if (!hasPermission(user.permissions, permission)) {
      throw new ForbiddenException(message);
    }
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async createTicket(
    user: AuthUser,
    dto: CreateSupportTicketInput,
  ): Promise<SupportTicketDetail> {
    const sessionId = await this.resolveRelatedSession(user, dto.sessionId);
    const now = new Date();
    const ticket = await this.repo.createTicket({
      id: randomUUID(),
      userId: user.id,
      sessionId,
      assigneeId: null,
      subject: dto.subject.trim(),
      category: this.oneOf(dto.category, SUPPORT_CATEGORIES, 'general'),
      priority: this.oneOf(dto.priority, SUPPORT_PRIORITIES, 'medium'),
      status: 'open',
      firstResponseAt: null,
      resolvedAt: null,
      closedAt: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await this.repo.addMessage({
      id: randomUUID(),
      ticketId: ticket.id,
      authorType: 'customer',
      authorId: user.id,
      body: dto.description.trim(),
      aiLayer: null,
      createdAt: now,
    });
    await this.recordEvent(ticket.id, 'ticket_created', 'customer', user.id, {
      subject: ticket.subject,
    });
    await this.notifications.ticketCreated(ticket);

    return this.getTicketDetail(user, ticket.id);
  }

  async getTicketDetail(
    user: AuthUser,
    ticketId: string,
  ): Promise<SupportTicketDetail> {
    const bundle = await this.repo.findTicketBundle(ticketId);
    if (!bundle) throw this.notFound(ticketId);
    this.assertAccess(user, bundle.ticket);
    return this.toDetail(user, bundle);
  }

  /** The signed-in customer's own tickets (scoped, filtered, paginated). */
  listMyTickets(
    user: AuthUser,
    filter: SupportTicketFilter,
  ): Promise<SupportTicketList> {
    return this.list({ ...this.normalizeFilter(filter), ownerId: user.id });
  }

  /** Admin: every ticket in the system (scoped null), filtered + paginated. */
  listAllTickets(filter: SupportTicketFilter): Promise<SupportTicketList> {
    return this.list({ ...this.normalizeFilter(filter), ownerId: null });
  }

  private async list(query: SupportListQuery): Promise<SupportTicketList> {
    const { rows, messageCounts, total } = await this.repo.listTickets(query);
    const lookup = await this.buildLookup(
      rows.map((r) => r.assigneeId),
      rows.map((r) => r.sessionId),
    );
    return {
      tickets: rows.map((r) =>
        toTicketSummary(r, messageCounts[r.id] ?? 0, lookup),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // ── Conversation ────────────────────────────────────────────────────────

  async reply(
    user: AuthUser,
    ticketId: string,
    body: string,
  ): Promise<SupportTicketDetail> {
    const ticket = await this.loadForAccess(user, ticketId);
    if (ticket.status === 'closed') {
      throw new ConflictException(
        'This ticket is closed. Reopen it before replying.',
      );
    }
    // Acting as staff = replying to a ticket you don't own (an owner always
    // replies as the customer, even if they're also staff). A staff reply needs
    // `support:reply`; a "view all tickets"-only role can read but not answer.
    const asStaff = this.isStaff(user) && ticket.userId !== user.id;
    if (asStaff) {
      this.requirePermission(
        user,
        'support:reply',
        'You do not have permission to reply to tickets.',
      );
    }
    const now = new Date();

    await this.repo.addMessage({
      id: randomUUID(),
      ticketId,
      authorType: asStaff ? 'admin' : 'customer',
      authorId: user.id,
      body: body.trim(),
      aiLayer: null,
      createdAt: now,
    });

    // A reply flips the "waiting on" side (admin → customer, customer → admin);
    // an admin reply also stamps the first-response time for SLA metrics.
    // Explicit workflow states (in_progress, resolved) are set by the admin via
    // a status change, not as a side effect of replying.
    const patch: Parameters<SupportRepository['updateTicket']>[1] = {
      lastMessageAt: now,
      status: asStaff ? 'waiting_customer' : 'waiting_admin',
    };
    if (asStaff && !ticket.firstResponseAt) patch.firstResponseAt = now;
    const updated = await this.repo.updateTicket(ticketId, patch);

    await this.recordEvent(ticketId, 'reply_added', asStaff ? 'admin' : 'customer', user.id);
    await this.notifications.replyAdded(updated, asStaff ? 'admin' : 'customer');
    return this.getTicketDetail(user, ticketId);
  }

  // ── Customer status transitions ──────────────────────────────────────────

  async closeTicket(
    user: AuthUser,
    ticketId: string,
  ): Promise<SupportTicketDetail> {
    const ticket = await this.loadForAccess(user, ticketId);
    this.assertCanChangeStatus(user, ticket);
    if (ticket.status === 'closed') return this.getTicketDetail(user, ticketId);
    await this.repo.updateTicket(ticketId, {
      status: 'closed',
      closedAt: new Date(),
    });
    await this.recordStatusEvent(ticketId, user, ticket.status, 'closed');
    const updated = await this.repo.findTicketById(ticketId);
    if (updated) await this.notifications.statusChanged(updated, 'closed');
    return this.getTicketDetail(user, ticketId);
  }

  async reopenTicket(
    user: AuthUser,
    ticketId: string,
  ): Promise<SupportTicketDetail> {
    const ticket = await this.loadForAccess(user, ticketId);
    this.assertCanChangeStatus(user, ticket);
    if (ticket.status !== 'closed' && ticket.status !== 'resolved') {
      throw new ConflictException('Only a resolved or closed ticket can be reopened.');
    }
    await this.repo.updateTicket(ticketId, {
      status: 'open',
      closedAt: null,
      resolvedAt: null,
    });
    await this.recordEvent(ticketId, 'reopened', this.isStaff(user) ? 'admin' : 'customer', user.id, {
      from: ticket.status,
    });
    return this.getTicketDetail(user, ticketId);
  }

  // ── Admin mutations ───────────────────────────────────────────────────────

  /** Admin: apply status / priority / category / assignee changes (each an event). */
  async adminUpdateTicket(
    admin: AuthUser,
    ticketId: string,
    patch: {
      status?: SupportTicketStatus;
      priority?: string;
      category?: string;
      assigneeId?: string | null;
    },
  ): Promise<SupportTicketDetail> {
    const ticket = await this.repo.findTicketById(ticketId);
    if (!ticket) throw this.notFound(ticketId);

    // Enforce a distinct permission per axis: changing status/priority/category
    // needs `support:manage`; (re)assigning needs `support:assign`. A role may
    // hold one without the other.
    const wantsWorkflow =
      (patch.status !== undefined && patch.status !== ticket.status) ||
      (patch.priority !== undefined && patch.priority !== ticket.priority) ||
      (patch.category !== undefined && patch.category !== ticket.category);
    const nextAssignee =
      patch.assigneeId === undefined ? undefined : patch.assigneeId || null;
    const wantsAssign =
      nextAssignee !== undefined && nextAssignee !== ticket.assigneeId;
    if (wantsWorkflow) {
      this.requirePermission(
        admin,
        'support:manage',
        'You do not have permission to manage tickets.',
      );
    }
    if (wantsAssign) {
      this.requirePermission(
        admin,
        'support:assign',
        'You do not have permission to assign tickets.',
      );
    }

    const now = new Date();
    const update: Parameters<SupportRepository['updateTicket']>[1] = {};

    if (patch.status && patch.status !== ticket.status) {
      this.assertStatus(patch.status);
      update.status = patch.status;
      if (patch.status === 'resolved') update.resolvedAt = now;
      if (patch.status === 'closed') update.closedAt = now;
      if (patch.status === 'open') {
        update.resolvedAt = null;
        update.closedAt = null;
      }
      await this.recordStatusEvent(ticketId, admin, ticket.status, patch.status);
    }
    if (patch.priority && patch.priority !== ticket.priority) {
      update.priority = this.oneOf(patch.priority, SUPPORT_PRIORITIES, ticket.priority);
      await this.recordEvent(ticketId, 'priority_changed', 'admin', admin.id, {
        from: ticket.priority,
        to: update.priority,
      });
    }
    if (patch.category && patch.category !== ticket.category) {
      update.category = this.oneOf(patch.category, SUPPORT_CATEGORIES, ticket.category);
      await this.recordEvent(ticketId, 'status_changed', 'admin', admin.id, {
        field: 'category',
        from: ticket.category,
        to: update.category,
      });
    }
    if (patch.assigneeId !== undefined) {
      const assigneeId = patch.assigneeId ? patch.assigneeId : null;
      if (assigneeId !== ticket.assigneeId) {
        if (assigneeId) await this.assertAssignable(assigneeId);
        update.assigneeId = assigneeId;
        if (assigneeId) {
          await this.recordEvent(ticketId, 'assigned', 'admin', admin.id, { assigneeId });
        } else {
          await this.recordEvent(ticketId, 'unassigned', 'admin', admin.id);
        }
      }
    }

    if (Object.keys(update).length > 0) {
      const updated = await this.repo.updateTicket(ticketId, update);
      if (update.status) await this.notifications.statusChanged(updated, update.status);
      if (update.assigneeId) await this.notifications.assigned(updated, update.assigneeId);
    }
    return this.getTicketDetail(admin, ticketId);
  }

  /** Admin: add a private internal note (never visible to the customer). */
  async addInternalNote(
    admin: AuthUser,
    ticketId: string,
    body: string,
  ): Promise<SupportTicketDetail> {
    const ticket = await this.repo.findTicketById(ticketId);
    if (!ticket) throw this.notFound(ticketId);
    await this.repo.addNote({
      id: randomUUID(),
      ticketId,
      authorId: admin.id,
      body: body.trim(),
      createdAt: new Date(),
    });
    await this.recordEvent(ticketId, 'note_added', 'admin', admin.id);
    return this.getTicketDetail(admin, ticketId);
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  async addAttachment(
    user: AuthUser,
    ticketId: string,
    input: {
      filename: string;
      mimeType: string;
      sizeBytes: number;
      textContent?: string;
      messageId?: string;
    },
  ): Promise<SupportTicketDetail> {
    await this.loadForAccess(user, ticketId);
    await this.repo.addAttachment({
      id: randomUUID(),
      ticketId,
      messageId: input.messageId ?? null,
      filename: input.filename.trim(),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      textContent: input.textContent ?? null,
      createdAt: new Date(),
    });
    await this.recordEvent(
      ticketId,
      'attachment_added',
      this.isStaff(user) ? 'admin' : 'customer',
      user.id,
      { filename: input.filename },
    );
    return this.getTicketDetail(user, ticketId);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  /** Admin support dashboard: status counts, SLA averages, and flagged tickets. */
  async adminStats(): Promise<SupportAdminStats> {
    const agg = await this.repo.adminAggregate();
    const lookup = await this.buildLookup(
      [...agg.newest, ...agg.aiFlaggedCritical].map((t) => t.assigneeId),
      [...agg.newest, ...agg.aiFlaggedCritical].map((t) => t.sessionId),
    );
    const c = (s: SupportTicketStatus) => agg.statusCounts[s] ?? 0;
    return {
      openTickets: c('open'),
      inProgress: c('in_progress'),
      waitingCustomer: c('waiting_customer'),
      waitingAdmin: c('waiting_admin'),
      resolved: c('resolved'),
      closed: c('closed'),
      critical: agg.critical,
      unassigned: agg.unassigned,
      avgFirstResponseMs: average(agg.firstResponseMs),
      avgResolutionMs: average(agg.resolutionMs),
      newest: agg.newest.map((t) => toTicketSummary(t, 0, lookup)),
      aiFlaggedCritical: agg.aiFlaggedCritical.map((t) =>
        toTicketSummary(t, 0, lookup),
      ),
    };
  }

  async customerStats(user: AuthUser): Promise<SupportCustomerStats> {
    const counts = await this.repo.statusCounts(user.id);
    const g = (s: SupportTicketStatus) => counts[s] ?? 0;
    return {
      total: SUPPORT_STATUSES.reduce((n, s) => n + g(s), 0),
      open: g('open'),
      inProgress: g('in_progress'),
      waiting: g('waiting_customer') + g('waiting_admin'),
      resolved: g('resolved'),
      closed: g('closed'),
    };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /** Load a ticket and assert the user may access it (owner or admin). */
  private async loadForAccess(
    user: AuthUser,
    ticketId: string,
  ): Promise<SupportTicketRecord> {
    const ticket = await this.repo.findTicketById(ticketId);
    if (!ticket) throw this.notFound(ticketId);
    this.assertAccess(user, ticket);
    return ticket;
  }

  /**
   * Owner, or staff with `support:read_all`, may access a ticket — 404 (not 403)
   * for anyone else to avoid an ID leak.
   */
  private assertAccess(user: AuthUser, ticket: SupportTicketRecord): void {
    if (hasPermission(user.permissions, 'support:read_all')) return;
    if (ticket.userId !== user.id) throw this.notFound(ticket.id);
  }

  /**
   * A customer may always close/reopen their OWN ticket. Staff acting on a
   * ticket they don't own are changing workflow state, so they need
   * `support:manage` — a read-only support role can't close others' tickets.
   */
  private assertCanChangeStatus(
    user: AuthUser,
    ticket: SupportTicketRecord,
  ): void {
    if (this.isStaff(user) && ticket.userId !== user.id) {
      this.requirePermission(
        user,
        'support:manage',
        'You do not have permission to change ticket status.',
      );
    }
  }

  private async resolveRelatedSession(
    user: AuthUser,
    sessionId?: string,
  ): Promise<string | null> {
    if (!sessionId) return null;
    const session = await this.sessions.findById(sessionId);
    // Only allow linking a project the customer owns (no cross-user linkage).
    if (!session || session.userId !== user.id) {
      throw new NotFoundException('Related project not found.');
    }
    return sessionId;
  }

  private async recordEvent(
    ticketId: string,
    type: SupportEventRecord['type'],
    actorType: SupportEventRecord['actorType'],
    actorId: string | null,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.addEvent({
      id: randomUUID(),
      ticketId,
      type,
      actorType,
      actorId,
      data: data ?? null,
      createdAt: new Date(),
    });
  }

  private recordStatusEvent(
    ticketId: string,
    actor: AuthUser,
    from: SupportTicketStatus,
    to: SupportTicketStatus,
  ): Promise<void> {
    const type = to === 'resolved' ? 'resolved' : to === 'closed' ? 'closed' : 'status_changed';
    return this.recordEvent(
      ticketId,
      type,
      this.isStaff(actor) ? 'admin' : 'customer',
      actor.id,
      { from, to },
    );
  }

  /** A ticket may only be assigned to support staff (holds `support:read_all`). */
  private async assertAssignable(userId: string): Promise<void> {
    const { permissions } = await this.roles.resolveAccess(userId);
    if (!hasPermission(permissions, 'support:read_all')) {
      throw new ConflictException('Assignee must be a support agent.');
    }
  }

  private normalizeFilter(f: SupportTicketFilter): SupportListQuery {
    return {
      ownerId: null,
      status: f.status && (SUPPORT_STATUSES as string[]).includes(f.status) ? f.status : undefined,
      priority:
        f.priority && (SUPPORT_PRIORITIES as string[]).includes(f.priority) ? f.priority : undefined,
      category:
        f.category && (SUPPORT_CATEGORIES as string[]).includes(f.category) ? f.category : undefined,
      search: f.search?.trim() || undefined,
      assigneeId: f.assigneeId?.trim() || undefined,
      page: Math.max(1, Math.floor(f.page ?? 1)),
      pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(f.pageSize ?? DEFAULT_PAGE_SIZE))),
    };
  }

  private oneOf<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
    fallback: T,
  ): T {
    return value && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fallback;
  }

  private assertStatus(status: string): void {
    if (!(SUPPORT_STATUSES as string[]).includes(status)) {
      throw new ConflictException(`Unknown status "${status}".`);
    }
  }

  private notFound(ticketId: string): NotFoundException {
    return new NotFoundException(`Support ticket ${ticketId} not found.`);
  }

  // ── Detail assembly + enrichment ──────────────────────────────────────────

  private async toDetail(
    user: AuthUser,
    bundle: SupportTicketBundle,
  ): Promise<SupportTicketDetail> {
    const { ticket, messages, attachments, notes, events, aiSuggestions } = bundle;
    const isAdmin = this.isStaff(user);

    const authorIds = [
      ...messages.map((m) => m.authorId),
      ...notes.map((n) => n.authorId),
      ...events.map((e) => e.actorId),
      ticket.assigneeId,
    ];
    const lookup = await this.buildLookup(authorIds, [ticket.sessionId]);

    const summary = toTicketSummary(ticket, messages.length, lookup);
    const customer = await this.customerInfo(ticket);
    const relatedProject = await this.relatedProject(ticket.sessionId);

    return {
      ...summary,
      messages: messages.map((m) => toMessage(m, attachments, lookup)),
      events: events.map((e) => toEvent(e, lookup)),
      attachments: attachments.map(toAttachment),
      aiSuggestions: aiSuggestions.map(toAiSuggestion),
      // Internal notes are admin-only — never leak them to the ticket owner.
      internalNotes: isAdmin ? notes.map((n) => toNote(n, lookup)) : [],
      customer,
      relatedProject,
    };
  }

  private async customerInfo(
    ticket: SupportTicketRecord,
  ): Promise<SupportCustomerInfo> {
    const [user, projectsCount, view] = await Promise.all([
      this.users.findById(ticket.userId),
      this.sessions.countByUserId(ticket.userId),
      this.billing.getView(ticket.userId).catch(() => null),
    ]);
    return {
      userId: ticket.userId,
      name: user?.displayName ?? 'Unknown',
      email: user?.email ?? '',
      plan: view?.plan ?? 'free',
      subscriptionStatus: view?.status ?? null,
      projectsCount,
      createdAt: user?.createdAt.toISOString() ?? ticket.createdAt.toISOString(),
      lastLoginAt: null,
    };
  }

  private async relatedProject(
    sessionId: string | null,
  ): Promise<SupportRelatedProject | null> {
    if (!sessionId) return null;
    const session = await this.sessions.findById(sessionId);
    if (!session) return null;
    return {
      sessionId,
      title: session.title || session.input.idea,
      status: session.status,
    };
  }

  /** Batch-resolve display names + project titles for a set of ids (dedup). */
  private async buildLookup(
    userIds: (string | null)[],
    sessionIds: (string | null)[],
  ): Promise<SupportNameLookup> {
    const names = new Map<string, string>();
    const projectTitles = new Map<string, string>();

    const uids = [...new Set(userIds.filter((v): v is string => !!v))];
    const sids = [...new Set(sessionIds.filter((v): v is string => !!v))];

    await Promise.all(
      uids.map(async (id) => {
        const u = await this.users.findById(id);
        if (u) names.set(id, u.displayName);
      }),
    );
    await Promise.all(
      sids.map(async (id) => {
        const s = await this.sessions.findById(id);
        if (s) projectTitles.set(id, s.title || s.input.idea);
      }),
    );
    return { names, projectTitles };
  }
}

/** Mean of a numeric array in ms, or null when empty. */
function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
