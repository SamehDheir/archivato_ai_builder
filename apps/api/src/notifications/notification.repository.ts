import type { CreateNotificationInput, Notification } from './notification.entity';

/** DI token for the notification store. */
export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

/**
 * Store for in-app notifications. Repository pattern (interface + in-memory +
 * Prisma), like every other store. All reads/writes are scoped to a `userId`
 * so a user can only ever touch their own notifications.
 */
export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<Notification>;
  /** Newest-first, capped at `limit`. */
  listByUser(userId: string, limit: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  /** Mark one notification read (no-op if it isn't the user's / doesn't exist). */
  markRead(userId: string, id: string): Promise<void>;
  markAllRead(userId: string): Promise<void>;
}
