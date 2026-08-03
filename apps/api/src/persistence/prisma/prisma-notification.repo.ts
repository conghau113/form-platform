import { Injectable } from "@nestjs/common";
import {
  type NewNotification,
  type NotificationRecord,
  NotificationRepo,
} from "../repositories/notification.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class PrismaNotificationRepo extends NotificationRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createMany(rows: NewNotification[]): Promise<void> {
    if (rows.length === 0) return;
    await this.prisma.notification.createMany({ data: rows });
  }

  listForUser(userId: string, tenantId: string, limit: number): Promise<NotificationRecord[]> {
    return this.prisma.notification.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  countUnread(userId: string, tenantId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, tenantId, readAt: null } });
  }

  async markRead(id: string, userId: string): Promise<boolean> {
    // `updateMany`, not `update`: the owner check belongs in the WHERE clause, so another user's id
    // matches zero rows instead of updating a row that was never theirs. `count` is how many rows
    // matched, which is also why an already-read row still answers `true` (idempotent).
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return count > 0;
  }

  async markAllRead(userId: string, tenantId: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, tenantId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
