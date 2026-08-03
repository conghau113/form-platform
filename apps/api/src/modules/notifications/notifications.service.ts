import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { NotificationRecord } from "../../persistence/repositories/notification.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { NotificationRepo } from "../../persistence/repositories/notification.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";
import type { NotificationKind } from "./notification-text.js";
import { caseLink, caseNotificationText } from "./notification-text.js";

/** Hard ceiling on one page of the feed: the bell is a dropdown, not an archive browser. */
export const MAX_NOTIFICATION_LIMIT = 100;
/** What the dropdown asks for when it names no limit. */
export const DEFAULT_NOTIFICATION_LIMIT = 20;

/** One event to fan out, as the case runtime describes it. */
export interface CaseEvent {
  kind: NotificationKind;
  tenantId: string;
  /** Who caused it — never notified about their own action. */
  actorId: string;
  /** Everyone the event concerns, before the actor and the access filter are applied. */
  recipientIds: string[];
  case: {
    id: string;
    projectId: string;
    workflowId: string;
    /** MUST be the denormalized, ungated `WorkflowInstanceSummary.label` — see `notification-text`. */
    label: string | null;
    statusLabel: string | null;
  };
  /** Only for `case.participant-added`. */
  roleCode?: string;
}

/**
 * In-app notifications (product-roadmap Phase E3b) — the bell in the nav rail.
 *
 * Two halves that deliberately live in ONE service. The read side (`list` / `unreadCount` / `read` /
 * `readAll`) is per-caller and needs no function gate: everyone has an inbox, and the only identity
 * it ever accepts is `@CurrentOwner()`. The write side ({@link emitCaseEvent}) is called by the case
 * runtime, and it is the single place that holds the three delivery rules, so no caller can get one
 * of them wrong:
 *
 * 1. **Never notify the actor about their own action** — the case runtime would otherwise have to
 *    remember to subtract itself from four different recipient lists.
 * 2. **Only notify people who can still open the project.** Casting already refuses anyone without
 *    project access (E3a), but access is revocable, and a notification carries a case LABEL. Someone
 *    who lost access must stop learning what the case is called, not merely fail to open the link.
 * 3. **Best-effort, always.** A notification is a side effect of the real work. Delivery failures are
 *    logged and swallowed, exactly like {@link MailService.send}, so a full disk never turns a
 *    successful `advance` into a 500 on work the engine has already committed.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notifications: NotificationRepo,
    private readonly tenants: TenantRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  /** The caller's feed in the workspace they are looking at, newest first. */
  async list(
    userId: string,
    limit = DEFAULT_NOTIFICATION_LIMIT,
    activeTenantId?: string,
  ): Promise<NotificationRecord[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) return [];
    const capped = Math.min(Math.max(limit, 1), MAX_NOTIFICATION_LIMIT);
    return this.notifications.listForUser(userId, tenantId, capped);
  }

  /** The badge: how many unread the caller has in the active workspace. */
  async unreadCount(userId: string, activeTenantId?: string): Promise<number> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) return 0;
    return this.notifications.countUnread(userId, tenantId);
  }

  /**
   * Mark one notification read. The ownership check is the repo's WHERE clause, so somebody else's
   * id neither reads as read nor reveals that it exists — it is a 404 either way.
   */
  async read(userId: string, id: string): Promise<void> {
    if (!(await this.notifications.markRead(id, userId))) {
      throw new NotFoundException(`Notification not found: ${id}`);
    }
  }

  /** Mark every unread notification in the active workspace read; returns how many were touched. */
  async readAll(userId: string, activeTenantId?: string): Promise<{ updated: number }> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) return { updated: 0 };
    return { updated: await this.notifications.markAllRead(userId, tenantId) };
  }

  /**
   * Fan an event out to everyone it concerns (best-effort — see the class doc). Recipients are
   * deduped, the actor is dropped, and whoever can no longer open the project is dropped too.
   */
  async emitCaseEvent(event: CaseEvent): Promise<void> {
    try {
      const candidates = [...new Set(event.recipientIds)].filter((id) => id !== event.actorId);
      if (candidates.length === 0) return;

      const allowed = await this.filterByProjectAccess(candidates, event.case.projectId);
      if (allowed.length === 0) return;

      const { title, body } = caseNotificationText(event.kind, {
        label: event.case.label,
        statusLabel: event.case.statusLabel,
        roleCode: event.roleCode,
      });
      const link = caseLink(event.case.projectId, event.case.workflowId, event.case.id);
      await this.notifications.createMany(
        allowed.map((userId) => ({
          userId,
          tenantId: event.tenantId,
          kind: event.kind,
          title,
          body,
          targetType: "workflow-instance",
          targetId: event.case.id,
          link,
        })),
      );
    } catch (err) {
      this.logger.error(
        `Failed to notify ${event.kind} on case ${event.case.id}: ${(err as Error).stack}`,
      );
    }
  }

  /** Keep only the recipients who can still open the project the case lives in (rule 2). */
  private async filterByProjectAccess(userIds: string[], projectId: string): Promise<string[]> {
    const verdicts = await Promise.all(
      userIds.map(async (userId) => ({
        userId,
        allowed: (await this.projectsService.resolveRole(userId, projectId)) !== null,
      })),
    );
    return verdicts.filter((v) => v.allowed).map((v) => v.userId);
  }
}
