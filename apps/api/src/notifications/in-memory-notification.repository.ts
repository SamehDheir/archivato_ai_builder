import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CreateNotificationInput, Notification } from './notification.entity';
import type { NotificationRepository } from './notification.repository';

/** In-memory notification store — used by unit tests (DB-free). */
@Injectable()
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly items = new Map<string, Notification>();

  async create(input: CreateNotificationInput): Promise<Notification> {
    const n: Notification = {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      read: false,
      createdAt: new Date(),
    };
    this.items.set(n.id, n);
    return { ...n };
  }

  async listByUser(userId: string, limit: number): Promise<Notification[]> {
    // Map iteration is insertion order (oldest→newest); reverse for newest-first.
    // Deterministic even for notifications created in the same millisecond.
    return [...this.items.values()]
      .filter((n) => n.userId === userId)
      .reverse()
      .slice(0, limit)
      .map((n) => ({ ...n }));
  }

  async countUnread(userId: string): Promise<number> {
    let n = 0;
    for (const item of this.items.values()) {
      if (item.userId === userId && !item.read) n++;
    }
    return n;
  }

  async markRead(userId: string, id: string): Promise<void> {
    const item = this.items.get(id);
    if (item && item.userId === userId) item.read = true;
  }

  async markAllRead(userId: string): Promise<void> {
    for (const item of this.items.values()) {
      if (item.userId === userId) item.read = true;
    }
  }
}
