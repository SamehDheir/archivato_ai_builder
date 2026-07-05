/**
 * Customer Support Center — cross-cutting domain types shared between the NestJS
 * API and the Next.js web client. Runtime-free (like the rest of this package).
 *
 * The Support Center is a professional ticketing system with an embedded AI
 * Support Assistant that works in three layers:
 *   1. Pre-ticket deflection  — analyze an issue, search KB + past tickets,
 *      suggest a solution before a ticket is created.
 *   2. In-ticket assistant     — summarize, root-cause, draft a reply/fix.
 *   3. Admin copilot           — the in-ticket analysis plus urgency, priority,
 *      assignment, and similar-ticket suggestions for admins.
 *
 * Statuses / priorities / categories are modelled as string unions (persisted as
 * plain string columns), matching the project's convention for enum-like fields
 * (subscription plan, account role, interview status) rather than Prisma enums.
 */

// ── Enumerated fields ────────────────────────────────────────────────────────

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_admin'
  | 'resolved'
  | 'closed';

export type SupportPriority = 'low' | 'medium' | 'high' | 'critical';

export type SupportCategory =
  | 'technical'
  | 'billing'
  | 'ai_generation'
  | 'api'
  | 'bug'
  | 'feature_request'
  | 'account'
  | 'security'
  | 'general';

/** Who authored a message / triggered a timeline event. */
export type SupportAuthorType = 'customer' | 'admin' | 'ai' | 'system';

/** Which AI layer produced an AI message / suggestion. */
export type SupportAiLayer = 'deflection' | 'in_ticket' | 'admin_copilot';

export type SupportEventType =
  | 'ticket_created'
  | 'reply_added'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'unassigned'
  | 'resolved'
  | 'closed'
  | 'reopened'
  | 'note_added'
  | 'attachment_added'
  | 'ai_suggestion';

/** Ordered lists (source of truth for UI dropdowns + validation). */
export const SUPPORT_STATUSES: readonly SupportTicketStatus[] = [
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
  'resolved',
  'closed',
];

export const SUPPORT_PRIORITIES: readonly SupportPriority[] = [
  'low',
  'medium',
  'high',
  'critical',
];

export const SUPPORT_CATEGORIES: readonly SupportCategory[] = [
  'technical',
  'billing',
  'ai_generation',
  'api',
  'bug',
  'feature_request',
  'account',
  'security',
  'general',
];

/** Statuses a customer may not set directly (admin/system transitions only). */
export const SUPPORT_OPEN_STATUSES: readonly SupportTicketStatus[] = [
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
];

/** Human labels (English default; the web layer may localize further). */
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  waiting_customer: 'Waiting for Customer',
  waiting_admin: 'Waiting for Admin',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  technical: 'Technical Issue',
  billing: 'Billing',
  ai_generation: 'AI Generation',
  api: 'API',
  bug: 'Bug Report',
  feature_request: 'Feature Request',
  account: 'Account',
  security: 'Security',
  general: 'General',
};

// ── Attachments ──────────────────────────────────────────────────────────────

/** Attachment mime allowlist (images, PDF, ZIP, TXT, JSON, logs). */
export const SUPPORT_ATTACHMENT_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'application/json',
  'text/x-log',
];

/** Max attachment size accepted by the API (5 MB). */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export interface SupportAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** True when the file is text-based and its content was extracted for AI. */
  isText: boolean;
  createdAt: string;
}

// ── Conversation ─────────────────────────────────────────────────────────────

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorType: SupportAuthorType;
  /** Null for AI / system messages. */
  authorId: string | null;
  /** Best-effort display name of the author (customer/admin). */
  authorName: string | null;
  /** Message body — may contain Markdown / fenced code blocks. */
  body: string;
  /** Set when authorType==='ai': which layer produced it. */
  aiLayer: SupportAiLayer | null;
  createdAt: string;
  attachments: SupportAttachment[];
}

/** Admin-only private note (never returned to the customer). */
export interface SupportInternalNote {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface SupportTicketEvent {
  id: string;
  ticketId: string;
  type: SupportEventType;
  actorType: SupportAuthorType;
  actorId: string | null;
  actorName: string | null;
  /** Small type-specific payload, e.g. { from, to } for a status change. */
  data: Record<string, unknown> | null;
  createdAt: string;
}

// ── AI outputs ───────────────────────────────────────────────────────────────

export interface KbArticleRef {
  id: string;
  title: string;
  excerpt: string;
}

export interface SimilarTicketRef {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketStatus;
}

/** Pre-ticket deflection: the AI's attempt to solve the issue before a ticket. */
export interface SupportDeflectionResult {
  /** The assistant's answer / proposed solution. */
  answer: string;
  /** True when the AI believes the issue is resolved (hide "create ticket"). */
  solved: boolean;
  confidence: number; // 0..1
  suggestedCategory: SupportCategory;
  suggestedPriority: SupportPriority;
  articles: KbArticleRef[];
  similarTickets: SimilarTicketRef[];
  quickFixes: string[];
  generatedAt: string;
}

/** In-ticket / admin-copilot structured analysis of a conversation. */
export interface SupportAiAnalysis {
  summary: string;
  rootCause: string;
  suggestedFix: string;
  suggestedReply: string;
  suggestedCategory: SupportCategory;
  suggestedPriority: SupportPriority;
  /** Admin copilot only: which admin/skill should own it (best-effort text). */
  suggestedAssignment: string | null;
  /** Admin copilot only: similar tickets across the system. */
  similarTickets: SimilarTicketRef[];
  confidence: number; // 0..1
  generatedAt: string;
}

// ── Customer + project context ───────────────────────────────────────────────

export interface SupportCustomerInfo {
  userId: string;
  name: string;
  email: string;
  plan: string; // 'free' | 'pro' (effective)
  subscriptionStatus: string | null;
  projectsCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SupportRelatedProject {
  sessionId: string;
  title: string;
  status: string;
}

/** An admin who can be assigned a ticket (admin assignment dropdown). */
export interface SupportAgentRef {
  id: string;
  name: string;
  email: string;
}

// ── Ticket shapes ────────────────────────────────────────────────────────────

/** List-row projection of a ticket. */
export interface SupportTicketSummary {
  id: string;
  number: number;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportTicketStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  sessionId: string | null;
  projectTitle: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

/** Full ticket detail (conversation + timeline + context). */
export interface SupportTicketDetail extends SupportTicketSummary {
  messages: SupportMessage[];
  events: SupportTicketEvent[];
  attachments: SupportAttachment[];
  aiSuggestions: SupportAiSuggestion[];
  /** Admin-only; omitted (empty) for the ticket owner. */
  internalNotes: SupportInternalNote[];
  customer: SupportCustomerInfo;
  relatedProject: SupportRelatedProject | null;
}

/** A persisted AI suggestion attached to a ticket (history of AI runs). */
export interface SupportAiSuggestion {
  id: string;
  ticketId: string;
  layer: SupportAiLayer;
  analysis: SupportAiAnalysis;
  createdAt: string;
}

/** Paginated list envelope. */
export interface SupportTicketList {
  tickets: SupportTicketSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** Customer-facing summary stats (the customer's own tickets). */
export interface SupportCustomerStats {
  total: number;
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  closed: number;
}

/** Admin support dashboard metrics. */
export interface SupportAdminStats {
  openTickets: number;
  inProgress: number;
  waitingCustomer: number;
  waitingAdmin: number;
  resolved: number;
  closed: number;
  critical: number;
  unassigned: number;
  /** Average time to first admin/AI response, in ms (null when no data). */
  avgFirstResponseMs: number | null;
  /** Average time from creation to resolution, in ms (null when no data). */
  avgResolutionMs: number | null;
  newest: SupportTicketSummary[];
  /** AI-detected critical/urgent tickets that need attention. */
  aiFlaggedCritical: SupportTicketSummary[];
}

// ── Request payloads ─────────────────────────────────────────────────────────

export interface CreateSupportTicketInput {
  subject: string;
  description: string;
  category: SupportCategory;
  priority?: SupportPriority;
  /** Optional related project (an interview session the customer owns). */
  sessionId?: string;
}

export interface SupportReplyInput {
  body: string;
}

export interface SupportAskAiInput {
  /** Free-text description of the problem (pre-ticket deflection). */
  message: string;
  /** Optional related project for extra AI context. */
  sessionId?: string;
}

export interface SupportTicketFilter {
  status?: SupportTicketStatus;
  priority?: SupportPriority;
  category?: SupportCategory;
  /** Free-text search over subject + body. */
  search?: string;
  /** Admin only: filter by assignee ('unassigned' for none). */
  assigneeId?: string;
  page?: number;
  pageSize?: number;
}
