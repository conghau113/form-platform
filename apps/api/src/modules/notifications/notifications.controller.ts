import { Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ActiveTenant } from "../../auth/active-tenant.decorator.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { NotificationRecord } from "../../persistence/repositories/notification.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { ListNotificationsDto } from "./dto/list-notifications.dto.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { NotificationsService } from "./notifications.service.js";

/**
 * The caller's notification inbox (product-roadmap Phase E3b).
 *
 * Deliberately NOT `@RequireFunction`-gated, unlike every other Phase C–E surface: a mailbox is not a
 * privilege, and every route here is already narrowed to `@CurrentOwner()`. That is also why no route
 * accepts a `userId` in any form — path, body or query. The only identity these endpoints can ever
 * operate on is the authenticated one, so there is no parameter an attacker could aim at somebody
 * else's inbox.
 */
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** The caller's feed in the active workspace, newest first. */
  @Get()
  list(
    @CurrentOwner() userId: string,
    @Query() dto: ListNotificationsDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<NotificationRecord[]> {
    return this.notifications.list(userId, dto.limit, activeTenantId);
  }

  /** Unread count for the badge — the only endpoint the client polls. */
  @Get("unread-count")
  async unreadCount(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(userId, activeTenantId) };
  }

  /** Mark one notification read → 404 when it is not the caller's (or does not exist). */
  @Post(":id/read")
  @HttpCode(204)
  read(@CurrentOwner() userId: string, @Param("id") id: string): Promise<void> {
    return this.notifications.read(userId, id);
  }

  /** Mark everything unread in the active workspace read. */
  @Post("read-all")
  readAll(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<{ updated: number }> {
    return this.notifications.readAll(userId, activeTenantId);
  }
}
