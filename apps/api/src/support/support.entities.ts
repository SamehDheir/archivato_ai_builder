import type {
  SupportAiLayer,
  SupportAuthorType,
  SupportCategory,
  SupportEventType,
  SupportPriority,
  SupportTicketStatus,
} from '@archivato/shared';

/**
 * Persistence-layer records for the Support Center aggregate. These mirror the
 * Prisma rows (dates as `Date`) and are mapped to the shared view types by
 * `support.mapper.ts`. Keeping them separate from the shared types lets the
 * repository stay framework-free and swappable (in-memory ↔ Prisma).
 */

export interface SupportTicketRecord {
  id: string;
  number: number;
  userId: string;
  sessionId: string | null;
  assigneeId: string | null;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportTicketStatus;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportMessageRecord {
  id: string;
  ticketId: string;
  authorType: SupportAuthorType;
  authorId: string | null;
  body: string;
  aiLayer: SupportAiLayer | null;
  createdAt: Date;
}

export interface SupportAttachmentRecord {
  id: string;
  ticketId: string;
  messageId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Extracted text for text-based files (AI-analyzable); null for binary. */
  textContent: string | null;
  createdAt: Date;
}

export interface SupportNoteRecord {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface SupportEventRecord {
  id: string;
  ticketId: string;
  type: SupportEventType;
  actorType: SupportAuthorType;
  actorId: string | null;
  data: Record<string, unknown> | null;
  createdAt: Date;
}

export interface SupportAiSuggestionRecord {
  id: string;
  ticketId: string;
  layer: SupportAiLayer;
  data: Record<string, unknown>;
  createdAt: Date;
}

/** Pre-ticket deflection (and ad-hoc "Ask AI") interaction log. */
export interface SupportAiInteractionRecord {
  id: string;
  userId: string | null;
  kind: 'deflection' | 'ask';
  query: string;
  response: Record<string, unknown>;
  deflected: boolean;
  createdAt: Date;
}

/** Everything needed to hydrate a ticket detail in one repository call. */
export interface SupportTicketBundle {
  ticket: SupportTicketRecord;
  messages: SupportMessageRecord[];
  attachments: SupportAttachmentRecord[];
  notes: SupportNoteRecord[];
  events: SupportEventRecord[];
  aiSuggestions: SupportAiSuggestionRecord[];
}

/** Normalized filter/scope passed to the repository's list query. */
export interface SupportListQuery {
  /** When set, only this user's tickets (customer scope). Null = all (admin). */
  ownerId: string | null;
  status?: SupportTicketStatus;
  priority?: SupportPriority;
  category?: SupportCategory;
  search?: string;
  /** Admin-only: an assignee id, or the literal 'unassigned'. */
  assigneeId?: string;
  page: number;
  pageSize: number;
}

export interface SupportListResult {
  rows: SupportTicketRecord[];
  /** Per-ticket message counts, keyed by ticket id (for list summaries). */
  messageCounts: Record<string, number>;
  total: number;
}

/** Raw aggregates for the admin support dashboard (enriched in the service). */
export interface SupportAdminAggregate {
  statusCounts: Record<SupportTicketStatus, number>;
  critical: number;
  unassigned: number;
  /** First-response durations (ms) for tickets that got a response. */
  firstResponseMs: number[];
  /** Resolution durations (ms) for resolved/closed tickets. */
  resolutionMs: number[];
  newest: SupportTicketRecord[];
  aiFlaggedCritical: SupportTicketRecord[];
}
