/**
 * In-app notifications (the bell/inbox). Delivered alongside email; a
 * notification is created for the recipient of a support event (ticket owner or
 * assignee). Content is server-authored English (like other AI/system output);
 * the bell chrome is i18n'd on the client. Keep this file runtime-free.
 */

/** What produced the notification (drives the icon on the client). */
export type NotificationType =
  | 'ticket_created'
  | 'ticket_reply'
  | 'ticket_status'
  | 'ticket_assigned'
  | 'ticket_alert';

/** One notification as shown in the bell dropdown. */
export interface NotificationView {
  id: string;
  type: NotificationType;
  /** Short headline, e.g. `New reply on ticket #42`. */
  title: string;
  /** One-line detail, e.g. the ticket subject. */
  body: string;
  /**
   * In-app link to open when clicked (relative path), e.g.
   * `/support/tickets/<id>` for a customer or `/support/admin/tickets/<id>`
   * for staff. `null` if the notification isn't linkable.
   */
  link: string | null;
  read: boolean;
  /** ISO timestamp. */
  createdAt: string;
}

/** A page of notifications plus the unread count (for the bell badge). */
export interface NotificationsPage {
  items: NotificationView[];
  /** Unread count across ALL notifications (not just this page). */
  unread: number;
}
