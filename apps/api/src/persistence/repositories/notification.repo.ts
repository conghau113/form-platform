/**
 * Persistence boundary for in-app notifications (product-roadmap Phase E3b).
 *
 * Like {@link CaseCommentRepo} this repo applies no access rules — but unlike it, every method is
 * already scoped by `userId`, because a notification has exactly one legitimate reader. That is not
 * a convenience: `markRead` takes the reader's id so the ownership check lands in the WHERE clause
 * rather than in a service that could forget it, and someone else's id is therefore a no-op at the
 * SQL level instead of a successful write on a row that was never theirs.
 */
export interface NotificationRecord {
  id: string;
  userId: string;
  tenantId: string;
  /** Event type, e.g. `case.assigned`. The client maps it to an icon; it grants nothing. */
  kind: string;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  /** In-app route to open the subject of the notification, or null. */
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** A row to fan out. `id`/`createdAt`/`readAt` come from the column defaults. */
export interface NewNotification {
  userId: string;
  tenantId: string;
  kind: string;
  title: string;
  body?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  link?: string | null;
}

export abstract class NotificationRepo {
  /** Write one row per recipient in a single statement. A no-op for an empty list. */
  abstract createMany(rows: NewNotification[]): Promise<void>;
  /** One person's feed in one workspace, newest first, capped by `limit`. */
  abstract listForUser(
    userId: string,
    tenantId: string,
    limit: number,
  ): Promise<NotificationRecord[]>;
  /** How many of them are unread — the badge, served by the `(userId, tenantId, readAt)` index. */
  abstract countUnread(userId: string, tenantId: string): Promise<number>;
  /**
   * Mark one row read, returning whether it actually belonged to this user (already-read rows still
   * count as theirs, so the call is idempotent). `false` is what the service turns into a 404: the
   * caller learns nothing about whether the id exists for someone else.
   */
  abstract markRead(id: string, userId: string): Promise<boolean>;
  /** Mark this user's unread rows in one workspace as read; returns how many were touched. */
  abstract markAllRead(userId: string, tenantId: string): Promise<number>;
}
