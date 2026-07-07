import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  NotificationType,
  SupportPriority,
  SupportTicketStatus,
} from '@archivato/shared';
import { USER_REPOSITORY, type UserRepository } from '../auth/user.repository';
import { MailService } from '../auth/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SupportTicketRecord } from './support.entities';

/**
 * Notification hooks for the Support Center. Each event delivers to the
 * **involved party** two ways: an **in-app** notification (the bell) and an
 * **email** via the shared `MailService`. Both are **best-effort** — a
 * notification/mail failure must never break the ticket action that triggered
 * it (the ticket write has already committed by the time these run).
 *
 * Recipients (no staff broadcast): a new ticket / status change confirms to the
 * owner; a reply notifies the *other* side (admin reply → owner, customer reply
 * → assignee); an assignment notifies the new assignee; an AI smart-alert goes
 * to the assignee (skipped if unassigned).
 */
@Injectable()
export class SupportNotificationsService {
  private readonly logger = new Logger(SupportNotificationsService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** A brand-new ticket was opened — confirm receipt to the customer. */
  async ticketCreated(ticket: SupportTicketRecord): Promise<void> {
    await this.deliver(
      ticket.userId,
      'ticket_created',
      `Ticket #${ticket.number} received`,
      `We've received your request: “${ticket.subject}”. Our team will follow up soon.`,
      this.customerLink(ticket),
    );
  }

  /** A reply was added — notify the other party. */
  async replyAdded(
    ticket: SupportTicketRecord,
    from: 'customer' | 'admin' | 'ai',
  ): Promise<void> {
    if (from === 'admin') {
      await this.deliver(
        ticket.userId,
        'ticket_reply',
        `New reply on ticket #${ticket.number}`,
        `Support replied to “${ticket.subject}”.`,
        this.customerLink(ticket),
      );
    } else if (from === 'customer') {
      // Only the assigned agent is notified — no broadcast to all staff.
      if (!ticket.assigneeId) return;
      await this.deliver(
        ticket.assigneeId,
        'ticket_reply',
        `New customer reply on ticket #${ticket.number}`,
        `The customer replied to “${ticket.subject}”.`,
        this.adminLink(ticket),
      );
    }
    // 'ai' suggestions are internal drafts — no notification.
  }

  /** A ticket's status changed — notify the customer. */
  async statusChanged(
    ticket: SupportTicketRecord,
    to: SupportTicketStatus,
  ): Promise<void> {
    await this.deliver(
      ticket.userId,
      'ticket_status',
      `Ticket #${ticket.number} is now “${humanStatus(to)}”`,
      `The status of “${ticket.subject}” changed to “${humanStatus(to)}”.`,
      this.customerLink(ticket),
    );
  }

  /** A ticket was assigned to an admin — notify that assignee. */
  async assigned(
    ticket: SupportTicketRecord,
    assigneeId: string,
  ): Promise<void> {
    await this.deliver(
      assigneeId,
      'ticket_assigned',
      `Ticket #${ticket.number} assigned to you`,
      `You've been assigned “${ticket.subject}”.`,
      this.adminLink(ticket),
    );
  }

  /**
   * AI-triggered smart alert (critical issue / SLA risk / unanswered ticket).
   * Goes to the assigned agent so it can be escalated; skipped when unassigned.
   */
  async smartAlert(
    kind: 'critical_issue' | 'sla_risk' | 'unanswered',
    ticket: SupportTicketRecord,
    priority: SupportPriority,
  ): Promise<void> {
    if (!ticket.assigneeId) return;
    await this.deliver(
      ticket.assigneeId,
      'ticket_alert',
      `[${priority}] ${alertTitle(kind)} · ticket #${ticket.number}`,
      `AI flagged “${ticket.subject}” — ${alertTitle(kind).toLowerCase()}.`,
      this.adminLink(ticket),
    );
  }

  // ── delivery ──────────────────────────────────────────────────────────

  /** Create the in-app notification and send the email — both best-effort. */
  private async deliver(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    relativeLink: string,
  ): Promise<void> {
    // In-app: NotificationsService.notify already swallows its own failures.
    await this.notifications.notify({ userId, type, title, body, link: relativeLink });

    // Email: resolve the recipient's address and send, swallowing any failure.
    try {
      const user = await this.users.findById(userId);
      if (user?.email) {
        await this.mail.sendNotificationEmail(
          user.email,
          title,
          body,
          this.absolute(relativeLink),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Support email failed for ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private customerLink(ticket: SupportTicketRecord): string {
    return `/support/tickets/${ticket.id}`;
  }

  private adminLink(ticket: SupportTicketRecord): string {
    return `/support/admin/tickets/${ticket.id}`;
  }

  private absolute(path: string): string {
    const origin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
    return `${origin}${path}`;
  }
}

/** "waiting_customer" → "waiting customer" for human-readable copy. */
function humanStatus(status: SupportTicketStatus): string {
  return status.replace(/_/g, ' ');
}

/** Human label for a smart-alert kind. */
function alertTitle(kind: 'critical_issue' | 'sla_risk' | 'unanswered'): string {
  switch (kind) {
    case 'critical_issue':
      return 'Critical issue';
    case 'sla_risk':
      return 'SLA risk';
    case 'unanswered':
      return 'Unanswered ticket';
  }
}
