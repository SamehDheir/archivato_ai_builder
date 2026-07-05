import { NotFoundException } from '@nestjs/common';
import type { SupportTicketStatus } from '@archivato/shared';
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

const ACTIVE: SupportTicketStatus[] = [
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
];

/**
 * In-memory Support store — backs the unit tests (DB-free) and mirrors the
 * Prisma implementation's behaviour. Not used by the running app.
 */
export class InMemorySupportRepository implements SupportRepository {
  private tickets: SupportTicketRecord[] = [];
  private messages: SupportMessageRecord[] = [];
  private attachments: SupportAttachmentRecord[] = [];
  private notes: SupportNoteRecord[] = [];
  private events: SupportEventRecord[] = [];
  private suggestions: SupportAiSuggestionRecord[] = [];
  private interactions: SupportAiInteractionRecord[] = [];
  private seq = 0;

  async createTicket(
    record: Omit<SupportTicketRecord, 'number'>,
  ): Promise<SupportTicketRecord> {
    const ticket: SupportTicketRecord = { ...record, number: ++this.seq };
    this.tickets.push(ticket);
    return { ...ticket };
  }

  async findTicketById(id: string): Promise<SupportTicketRecord | null> {
    const t = this.tickets.find((x) => x.id === id);
    return t ? { ...t } : null;
  }

  async findTicketBundle(id: string): Promise<SupportTicketBundle | null> {
    const ticket = this.tickets.find((x) => x.id === id);
    if (!ticket) return null;
    const byTime = (a: { createdAt: Date }, b: { createdAt: Date }) =>
      a.createdAt.getTime() - b.createdAt.getTime();
    return {
      ticket: { ...ticket },
      messages: this.messages.filter((m) => m.ticketId === id).sort(byTime),
      attachments: this.attachments.filter((a) => a.ticketId === id).sort(byTime),
      notes: this.notes.filter((n) => n.ticketId === id).sort(byTime),
      events: this.events.filter((e) => e.ticketId === id).sort(byTime),
      aiSuggestions: this.suggestions
        .filter((s) => s.ticketId === id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    };
  }

  async updateTicket(
    id: string,
    patch: Parameters<SupportRepository['updateTicket']>[1],
  ): Promise<SupportTicketRecord> {
    const t = this.tickets.find((x) => x.id === id);
    if (!t) throw new NotFoundException(`Support ticket ${id} not found.`);
    Object.assign(t, patch, { updatedAt: new Date() });
    return { ...t };
  }

  async listTickets(query: SupportListQuery): Promise<SupportListResult> {
    const matched = this.tickets
      .filter((t) => this.matches(t, query))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const total = matched.length;
    const start = (query.page - 1) * query.pageSize;
    const rows = matched.slice(start, start + query.pageSize).map((t) => ({ ...t }));
    const messageCounts: Record<string, number> = {};
    for (const t of rows) {
      messageCounts[t.id] = this.messages.filter((m) => m.ticketId === t.id).length;
    }
    return { rows, messageCounts, total };
  }

  private matches(t: SupportTicketRecord, q: SupportListQuery): boolean {
    if (q.ownerId && t.userId !== q.ownerId) return false;
    if (q.status && t.status !== q.status) return false;
    if (q.priority && t.priority !== q.priority) return false;
    if (q.category && t.category !== q.category) return false;
    if (q.assigneeId) {
      if (q.assigneeId === 'unassigned' ? t.assigneeId !== null : t.assigneeId !== q.assigneeId) {
        return false;
      }
    }
    if (q.search) {
      const s = q.search.toLowerCase();
      const inSubject = t.subject.toLowerCase().includes(s);
      const inBody = this.messages.some(
        (m) => m.ticketId === t.id && m.body.toLowerCase().includes(s),
      );
      const asNum = Number.parseInt(s.replace('#', ''), 10);
      if (!inSubject && !inBody && t.number !== asNum) return false;
    }
    return true;
  }

  async addMessage(record: SupportMessageRecord): Promise<SupportMessageRecord> {
    this.messages.push({ ...record });
    return { ...record };
  }

  async listMessages(ticketId: string): Promise<SupportMessageRecord[]> {
    return this.messages
      .filter((m) => m.ticketId === ticketId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => ({ ...m }));
  }

  async addAttachment(
    record: SupportAttachmentRecord,
  ): Promise<SupportAttachmentRecord> {
    this.attachments.push({ ...record });
    return { ...record };
  }

  async findAttachment(id: string): Promise<SupportAttachmentRecord | null> {
    const a = this.attachments.find((x) => x.id === id);
    return a ? { ...a } : null;
  }

  async addNote(record: SupportNoteRecord): Promise<SupportNoteRecord> {
    this.notes.push({ ...record });
    return { ...record };
  }

  async addEvent(record: SupportEventRecord): Promise<SupportEventRecord> {
    this.events.push({ ...record });
    return { ...record };
  }

  async addAiSuggestion(
    record: SupportAiSuggestionRecord,
  ): Promise<SupportAiSuggestionRecord> {
    this.suggestions.push({ ...record });
    return { ...record };
  }

  async addAiInteraction(record: SupportAiInteractionRecord): Promise<void> {
    this.interactions.push({ ...record });
  }

  async statusCounts(ownerId: string | null): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const t of this.tickets) {
      if (ownerId && t.userId !== ownerId) continue;
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }

  async adminAggregate(): Promise<SupportAdminAggregate> {
    const statusCounts = {} as SupportAdminAggregate['statusCounts'];
    for (const t of this.tickets) {
      statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
    }
    const active = (t: SupportTicketRecord) => ACTIVE.includes(t.status);
    const byCreated = (a: SupportTicketRecord, b: SupportTicketRecord) =>
      b.createdAt.getTime() - a.createdAt.getTime();

    return {
      statusCounts,
      critical: this.tickets.filter((t) => t.priority === 'critical' && active(t)).length,
      unassigned: this.tickets.filter((t) => t.assigneeId === null && active(t)).length,
      firstResponseMs: this.tickets
        .filter((t) => t.firstResponseAt)
        .map((t) => t.firstResponseAt!.getTime() - t.createdAt.getTime()),
      resolutionMs: this.tickets
        .filter((t) => t.resolvedAt || t.closedAt)
        .map((t) => (t.resolvedAt ?? t.closedAt!).getTime() - t.createdAt.getTime()),
      newest: [...this.tickets].sort(byCreated).slice(0, 8).map((t) => ({ ...t })),
      aiFlaggedCritical: this.tickets
        .filter(
          (t) =>
            (t.priority === 'high' || t.priority === 'critical') &&
            ['open', 'waiting_admin', 'in_progress'].includes(t.status),
        )
        .sort(byCreated)
        .slice(0, 8)
        .map((t) => ({ ...t })),
    };
  }
}
