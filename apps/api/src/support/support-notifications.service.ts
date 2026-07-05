import { Injectable, Logger } from '@nestjs/common';
import type {
  SupportPriority,
  SupportTicketStatus,
} from '@archivato/shared';
import type { SupportTicketRecord } from './support.entities';

/**
 * Notification hooks for the Support Center (placeholder implementation).
 *
 * This is intentionally a stub: it centralizes every point where the product
 * would send an **in-app** or **email** notification, and today just logs
 * (best-effort — a notification failure must never break a ticket action). Wire
 * a real channel (the existing `MailService`, a websocket, a push provider) into
 * these methods later without touching the callers.
 *
 * AI-driven "smart" notifications (critical issue detected, SLA risk, ticket
 * unanswered) funnel through `smartAlert` so they can be prioritized/deduped
 * when a real channel is added.
 */
@Injectable()
export class SupportNotificationsService {
  private readonly logger = new Logger(SupportNotificationsService.name);

  /** A brand-new ticket was opened (notify support staff / confirm to customer). */
  async ticketCreated(ticket: SupportTicketRecord): Promise<void> {
    this.emit('ticket_created', ticket.id, `#${ticket.number} "${ticket.subject}"`);
  }

  /** A reply was added — notify the other party (customer ↔ admin). */
  async replyAdded(
    ticket: SupportTicketRecord,
    from: 'customer' | 'admin' | 'ai',
  ): Promise<void> {
    this.emit('reply_added', ticket.id, `from ${from}`);
  }

  /** A ticket's status changed (e.g. resolved → notify the customer). */
  async statusChanged(
    ticket: SupportTicketRecord,
    to: SupportTicketStatus,
  ): Promise<void> {
    this.emit('status_changed', ticket.id, `→ ${to}`);
  }

  /** A ticket was assigned to an admin. */
  async assigned(ticket: SupportTicketRecord, assigneeId: string): Promise<void> {
    this.emit('assigned', ticket.id, `→ ${assigneeId}`);
  }

  /**
   * AI-triggered smart alert (critical issue / SLA risk / unanswered ticket).
   * Kept distinct so a real channel can escalate these ahead of routine events.
   */
  async smartAlert(
    kind: 'critical_issue' | 'sla_risk' | 'unanswered',
    ticket: SupportTicketRecord,
    priority: SupportPriority,
  ): Promise<void> {
    this.emit('smart_alert', ticket.id, `${kind} (${priority})`);
  }

  private emit(event: string, ticketId: string, detail: string): void {
    // Placeholder sink. Swap for MailService / websocket / push later.
    this.logger.debug(`[notify] ${event} · ticket ${ticketId} · ${detail}`);
  }
}
