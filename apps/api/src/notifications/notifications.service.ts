import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NotificationView, NotificationsPage } from '@archivato/shared';
import type { CreateNotificationInput, Notification } from './notification.entity';
import {
  NOTIFICATION_REPOSITORY,
  type NotificationRepository,
} from './notification.repository';

/** How many notifications the bell dropdown shows. */
const PAGE_LIMIT = 20;

/**
 * In-app notifications. `notify()` is **best-effort** — it never throws into its
 * caller (a support ticket action must not fail because a notification couldn't
 * be written), mirroring how the mail sends are wrapped at their call sites.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: NotificationRepository,
  ) {}

  /** Create a notification for a user. Swallows failures (logs) — never throws. */
  async notify(input: CreateNotificationInput): Promise<void> {
    try {
      await this.repo.create(input);
    } catch (err) {
      this.logger.warn(
        `Failed to create notification for ${input.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** The bell payload: newest notifications + the total unread count. */
  async page(userId: string): Promise<NotificationsPage> {
    const [items, unread] = await Promise.all([
      this.repo.listByUser(userId, PAGE_LIMIT),
      this.repo.countUnread(userId),
    ]);
    return { items: items.map(toView), unread };
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.repo.markRead(userId, id);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.markAllRead(userId);
  }
}

function toView(n: Notification): NotificationView {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}
