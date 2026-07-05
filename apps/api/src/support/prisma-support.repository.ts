import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  SupportCategory,
  SupportPriority,
  SupportTicketStatus,
} from '@archivato/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { SupportRepository } from './support.repository';
import type {
  SupportAdminAggregate,
  SupportAiInteractionRecord,
  SupportAiSuggestionRecord,
  SupportAttachmentRecord,
  SupportEventRecord,
  SupportListQuery,
  SupportListResult,
  SupportMessageRecord,
  SupportNoteRecord,
  SupportTicketBundle,
  SupportTicketRecord,
} from './support.entities';

/** Statuses that count as "still open" for critical/unassigned aggregates. */
const ACTIVE_STATUSES: SupportTicketStatus[] = [
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
];

type TicketRow = Prisma.SupportTicketGetPayload<Record<string, never>>;
type MessageRow = Prisma.SupportMessageGetPayload<Record<string, never>>;
type AttachmentRow = Prisma.SupportAttachmentGetPayload<Record<string, never>>;
type NoteRow = Prisma.SupportInternalNoteGetPayload<Record<string, never>>;
type EventRow = Prisma.SupportTicketEventGetPayload<Record<string, never>>;
type SuggestionRow = Prisma.SupportAiSuggestionGetPayload<Record<string, never>>;

/** PostgreSQL-backed Support Center store (Repository pattern). */
@Injectable()
export class PrismaSupportRepository implements SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Tickets ───────────────────────────────────────────────────────────────

  async createTicket(
    record: Omit<SupportTicketRecord, 'number'>,
  ): Promise<SupportTicketRecord> {
    const row = await this.prisma.supportTicket.create({
      data: {
        id: record.id,
        userId: record.userId,
        sessionId: record.sessionId,
        assigneeId: record.assigneeId,
        subject: record.subject,
        category: record.category,
        priority: record.priority,
        status: record.status,
        firstResponseAt: record.firstResponseAt,
        resolvedAt: record.resolvedAt,
        closedAt: record.closedAt,
        lastMessageAt: record.lastMessageAt,
        createdAt: record.createdAt,
      },
    });
    return toTicket(row);
  }

  async findTicketById(id: string): Promise<SupportTicketRecord | null> {
    const row = await this.prisma.supportTicket.findUnique({ where: { id } });
    return row ? toTicket(row) : null;
  }

  async findTicketBundle(id: string): Promise<SupportTicketBundle | null> {
    const row = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        internalNotes: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        aiSuggestions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) return null;
    return {
      ticket: toTicket(row),
      messages: row.messages.map(toMessage),
      attachments: row.attachments.map(toAttachment),
      notes: row.internalNotes.map(toNote),
      events: row.events.map(toEvent),
      aiSuggestions: row.aiSuggestions.map(toSuggestion),
    };
  }

  async updateTicket(
    id: string,
    patch: Parameters<SupportRepository['updateTicket']>[1],
  ): Promise<SupportTicketRecord> {
    const row = await this.prisma.supportTicket.update({
      where: { id },
      data: patch,
    });
    return toTicket(row);
  }

  async listTickets(query: SupportListQuery): Promise<SupportListResult> {
    const where = this.buildWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    const messageCounts: Record<string, number> = {};
    for (const r of rows) messageCounts[r.id] = r._count.messages;
    return { rows: rows.map(toTicket), messageCounts, total };
  }

  private buildWhere(query: SupportListQuery): Prisma.SupportTicketWhereInput {
    const where: Prisma.SupportTicketWhereInput = {};
    if (query.ownerId) where.userId = query.ownerId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;
    if (query.assigneeId) {
      where.assigneeId = query.assigneeId === 'unassigned' ? null : query.assigneeId;
    }
    if (query.search) {
      const s = query.search;
      const or: Prisma.SupportTicketWhereInput[] = [
        { subject: { contains: s, mode: 'insensitive' } },
        { messages: { some: { body: { contains: s, mode: 'insensitive' } } } },
      ];
      const asNumber = Number.parseInt(s.replace('#', ''), 10);
      if (Number.isFinite(asNumber)) or.push({ number: asNumber });
      where.OR = or;
    }
    return where;
  }

  // ── Conversation ─────────────────────────────────────────────────────────

  async addMessage(record: SupportMessageRecord): Promise<SupportMessageRecord> {
    const row = await this.prisma.supportMessage.create({
      data: {
        id: record.id,
        ticketId: record.ticketId,
        authorType: record.authorType,
        authorId: record.authorId,
        body: record.body,
        aiLayer: record.aiLayer,
        createdAt: record.createdAt,
      },
    });
    return toMessage(row);
  }

  async listMessages(ticketId: string): Promise<SupportMessageRecord[]> {
    const rows = await this.prisma.supportMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toMessage);
  }

  // ── Attachments ────────────────────────────────────────────────────────────

  async addAttachment(
    record: SupportAttachmentRecord,
  ): Promise<SupportAttachmentRecord> {
    const row = await this.prisma.supportAttachment.create({
      data: {
        id: record.id,
        ticketId: record.ticketId,
        messageId: record.messageId,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        textContent: record.textContent,
        createdAt: record.createdAt,
      },
    });
    return toAttachment(row);
  }

  async findAttachment(id: string): Promise<SupportAttachmentRecord | null> {
    const row = await this.prisma.supportAttachment.findUnique({ where: { id } });
    return row ? toAttachment(row) : null;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async addNote(record: SupportNoteRecord): Promise<SupportNoteRecord> {
    const row = await this.prisma.supportInternalNote.create({
      data: {
        id: record.id,
        ticketId: record.ticketId,
        authorId: record.authorId,
        body: record.body,
        createdAt: record.createdAt,
      },
    });
    return toNote(row);
  }

  // ── Timeline ────────────────────────────────────────────────────────────────

  async addEvent(record: SupportEventRecord): Promise<SupportEventRecord> {
    const row = await this.prisma.supportTicketEvent.create({
      data: {
        id: record.id,
        ticketId: record.ticketId,
        type: record.type,
        actorType: record.actorType,
        actorId: record.actorId,
        data: (record.data ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: record.createdAt,
      },
    });
    return toEvent(row);
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  async addAiSuggestion(
    record: SupportAiSuggestionRecord,
  ): Promise<SupportAiSuggestionRecord> {
    const row = await this.prisma.supportAiSuggestion.create({
      data: {
        id: record.id,
        ticketId: record.ticketId,
        layer: record.layer,
        data: record.data as Prisma.InputJsonValue,
        createdAt: record.createdAt,
      },
    });
    return toSuggestion(row);
  }

  async addAiInteraction(record: SupportAiInteractionRecord): Promise<void> {
    await this.prisma.supportAiInteraction.create({
      data: {
        id: record.id,
        userId: record.userId,
        kind: record.kind,
        query: record.query,
        response: record.response as Prisma.InputJsonValue,
        deflected: record.deflected,
        createdAt: record.createdAt,
      },
    });
  }

  // ── Reporting ────────────────────────────────────────────────────────────

  async statusCounts(ownerId: string | null): Promise<Record<string, number>> {
    const groups = await this.prisma.supportTicket.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: ownerId ? { userId: ownerId } : undefined,
    });
    const counts: Record<string, number> = {};
    for (const g of groups) counts[g.status] = g._count._all;
    return counts;
  }

  async adminAggregate(): Promise<SupportAdminAggregate> {
    const [groups, critical, unassigned, responded, resolved, newest, flagged] =
      await Promise.all([
        this.prisma.supportTicket.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.supportTicket.count({
          where: { priority: 'critical', status: { in: ACTIVE_STATUSES } },
        }),
        this.prisma.supportTicket.count({
          where: { assigneeId: null, status: { in: ACTIVE_STATUSES } },
        }),
        this.prisma.supportTicket.findMany({
          where: { firstResponseAt: { not: null } },
          select: { createdAt: true, firstResponseAt: true },
          take: 500,
        }),
        this.prisma.supportTicket.findMany({
          where: { OR: [{ resolvedAt: { not: null } }, { closedAt: { not: null } }] },
          select: { createdAt: true, resolvedAt: true, closedAt: true },
          take: 500,
        }),
        this.prisma.supportTicket.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        this.prisma.supportTicket.findMany({
          where: {
            priority: { in: ['high', 'critical'] },
            status: { in: ['open', 'waiting_admin', 'in_progress'] },
          },
          orderBy: [{ createdAt: 'desc' }],
          take: 8,
        }),
      ]);

    const statusCounts = {} as SupportAdminAggregate['statusCounts'];
    for (const g of groups) {
      statusCounts[g.status as SupportTicketStatus] = g._count._all;
    }

    return {
      statusCounts,
      critical,
      unassigned,
      firstResponseMs: responded.map(
        (r) => r.firstResponseAt!.getTime() - r.createdAt.getTime(),
      ),
      resolutionMs: resolved.map((r) => {
        const end = r.resolvedAt ?? r.closedAt!;
        return end.getTime() - r.createdAt.getTime();
      }),
      newest: newest.map(toTicket),
      aiFlaggedCritical: flagged.map(toTicket),
    };
  }
}

// ── row → record mappers ────────────────────────────────────────────────────

function toTicket(r: TicketRow): SupportTicketRecord {
  return {
    id: r.id,
    number: r.number,
    userId: r.userId,
    sessionId: r.sessionId,
    assigneeId: r.assigneeId,
    subject: r.subject,
    category: r.category as SupportCategory,
    priority: r.priority as SupportPriority,
    status: r.status as SupportTicketStatus,
    firstResponseAt: r.firstResponseAt,
    resolvedAt: r.resolvedAt,
    closedAt: r.closedAt,
    lastMessageAt: r.lastMessageAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toMessage(r: MessageRow): SupportMessageRecord {
  return {
    id: r.id,
    ticketId: r.ticketId,
    authorType: r.authorType as SupportMessageRecord['authorType'],
    authorId: r.authorId,
    body: r.body,
    aiLayer: r.aiLayer as SupportMessageRecord['aiLayer'],
    createdAt: r.createdAt,
  };
}

function toAttachment(r: AttachmentRow): SupportAttachmentRecord {
  return {
    id: r.id,
    ticketId: r.ticketId,
    messageId: r.messageId,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    textContent: r.textContent,
    createdAt: r.createdAt,
  };
}

function toNote(r: NoteRow): SupportNoteRecord {
  return {
    id: r.id,
    ticketId: r.ticketId,
    authorId: r.authorId,
    body: r.body,
    createdAt: r.createdAt,
  };
}

function toEvent(r: EventRow): SupportEventRecord {
  return {
    id: r.id,
    ticketId: r.ticketId,
    type: r.type as SupportEventRecord['type'],
    actorType: r.actorType as SupportEventRecord['actorType'],
    actorId: r.actorId,
    data: (r.data as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt,
  };
}

function toSuggestion(r: SuggestionRow): SupportAiSuggestionRecord {
  return {
    id: r.id,
    ticketId: r.ticketId,
    layer: r.layer as SupportAiSuggestionRecord['layer'],
    data: r.data as Record<string, unknown>,
    createdAt: r.createdAt,
  };
}
