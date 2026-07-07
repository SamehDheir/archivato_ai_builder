import type { NotificationType } from '@archivato/shared';

/** A persisted in-app notification (one row per recipient per event). */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

/** Fields needed to create a notification (server sets id/read/createdAt). */
export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}
