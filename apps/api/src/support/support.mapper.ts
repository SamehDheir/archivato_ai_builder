import type {
  SupportAiSuggestion,
  SupportAttachment,
  SupportMessage,
  SupportTicketEvent,
  SupportInternalNote,
  SupportTicketSummary,
  SupportAiAnalysis,
} from '@archivato/shared';
import type {
  SupportAiSuggestionRecord,
  SupportAttachmentRecord,
  SupportEventRecord,
  SupportMessageRecord,
  SupportNoteRecord,
  SupportTicketRecord,
} from './support.entities';

/** Best-effort display metadata resolved for a set of tickets/authors. */
export interface SupportNameLookup {
  /** userId → display name. */
  names: Map<string, string>;
  /** sessionId → project title (title || idea). */
  projectTitles: Map<string, string>;
}

const isText = (a: SupportAttachmentRecord): boolean => a.textContent != null;

export function toAttachment(a: SupportAttachmentRecord): SupportAttachment {
  return {
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    isText: isText(a),
    createdAt: a.createdAt.toISOString(),
  };
}

export function toMessage(
  m: SupportMessageRecord,
  attachments: SupportAttachmentRecord[],
  lookup: SupportNameLookup,
): SupportMessage {
  return {
    id: m.id,
    ticketId: m.ticketId,
    authorType: m.authorType,
    authorId: m.authorId,
    authorName: m.authorId ? lookup.names.get(m.authorId) ?? null : null,
    body: m.body,
    aiLayer: m.aiLayer,
    createdAt: m.createdAt.toISOString(),
    attachments: attachments
      .filter((a) => a.messageId === m.id)
      .map(toAttachment),
  };
}

export function toNote(
  n: SupportNoteRecord,
  lookup: SupportNameLookup,
): SupportInternalNote {
  return {
    id: n.id,
    ticketId: n.ticketId,
    authorId: n.authorId,
    authorName: lookup.names.get(n.authorId) ?? null,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
  };
}

export function toEvent(
  e: SupportEventRecord,
  lookup: SupportNameLookup,
): SupportTicketEvent {
  return {
    id: e.id,
    ticketId: e.ticketId,
    type: e.type,
    actorType: e.actorType,
    actorId: e.actorId,
    actorName: e.actorId ? lookup.names.get(e.actorId) ?? null : null,
    data: e.data,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toAiSuggestion(
  s: SupportAiSuggestionRecord,
): SupportAiSuggestion {
  return {
    id: s.id,
    ticketId: s.ticketId,
    layer: s.layer,
    analysis: s.data as unknown as SupportAiAnalysis,
    createdAt: s.createdAt.toISOString(),
  };
}

export function toTicketSummary(
  t: SupportTicketRecord,
  messageCount: number,
  lookup: SupportNameLookup,
): SupportTicketSummary {
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    category: t.category,
    priority: t.priority,
    status: t.status,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeId ? lookup.names.get(t.assigneeId) ?? null : null,
    sessionId: t.sessionId,
    projectTitle: t.sessionId
      ? lookup.projectTitles.get(t.sessionId) ?? null
      : null,
    messageCount,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    lastMessageAt: t.lastMessageAt ? t.lastMessageAt.toISOString() : null,
  };
}
