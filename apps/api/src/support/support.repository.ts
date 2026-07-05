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

/** DI token for the Support Center store. */
export const SUPPORT_REPOSITORY = Symbol('SUPPORT_REPOSITORY');

/**
 * Persistence seam for the whole Support aggregate (tickets + messages +
 * attachments + notes + events + AI suggestions). Repository pattern — swapped
 * from in-memory (tests, DB-free) to Prisma/Postgres without touching the
 * services. Ownership/authorization is enforced in the service, not here.
 */
export interface SupportRepository {
  // Tickets ------------------------------------------------------------------
  createTicket(
    record: Omit<SupportTicketRecord, 'number'>,
  ): Promise<SupportTicketRecord>;
  findTicketById(id: string): Promise<SupportTicketRecord | null>;
  /** Full detail bundle (children ordered chronologically). Null if missing. */
  findTicketBundle(id: string): Promise<SupportTicketBundle | null>;
  updateTicket(
    id: string,
    patch: Partial<
      Pick<
        SupportTicketRecord,
        | 'subject'
        | 'category'
        | 'priority'
        | 'status'
        | 'assigneeId'
        | 'sessionId'
        | 'firstResponseAt'
        | 'resolvedAt'
        | 'closedAt'
        | 'lastMessageAt'
      >
    >,
  ): Promise<SupportTicketRecord>;
  listTickets(query: SupportListQuery): Promise<SupportListResult>;

  // Conversation -------------------------------------------------------------
  addMessage(record: SupportMessageRecord): Promise<SupportMessageRecord>;
  listMessages(ticketId: string): Promise<SupportMessageRecord[]>;

  // Attachments --------------------------------------------------------------
  addAttachment(
    record: SupportAttachmentRecord,
  ): Promise<SupportAttachmentRecord>;
  findAttachment(id: string): Promise<SupportAttachmentRecord | null>;

  // Internal notes (admin) ---------------------------------------------------
  addNote(record: SupportNoteRecord): Promise<SupportNoteRecord>;

  // Timeline -----------------------------------------------------------------
  addEvent(record: SupportEventRecord): Promise<SupportEventRecord>;

  // AI suggestions -----------------------------------------------------------
  addAiSuggestion(
    record: SupportAiSuggestionRecord,
  ): Promise<SupportAiSuggestionRecord>;
  /** Best-effort log of a pre-ticket deflection / "Ask AI" run. */
  addAiInteraction(record: SupportAiInteractionRecord): Promise<void>;

  // Reporting ----------------------------------------------------------------
  /** Status counts for a scope (customer or global) — customer dashboard. */
  statusCounts(ownerId: string | null): Promise<Record<string, number>>;
  /** Rich aggregate for the admin dashboard (global scope). */
  adminAggregate(): Promise<SupportAdminAggregate>;
}
