import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  NewNotification,
  NotificationRecord,
} from "../../persistence/repositories/notification.repo.js";
import { NotificationRepo } from "../../persistence/repositories/notification.repo.js";
import { FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import type { ProjectsService } from "../projects/projects.service.js";
import {
  type CaseEvent,
  MAX_NOTIFICATION_LIMIT,
  NotificationsService,
} from "./notifications.service.js";

let seq = 0;

/**
 * In-memory {@link NotificationRepo}. `markRead` filters on `(id, userId)` exactly as the Prisma
 * `updateMany` does — that pairing IS the ownership rule, so a fake that checked only the id would
 * make the 404 test pass for the wrong reason.
 */
class FakeNotificationRepo extends NotificationRepo {
  readonly rows: NotificationRecord[] = [];
  failWrites = false;

  async createMany(rows: NewNotification[]): Promise<void> {
    if (this.failWrites) throw new Error("notification store is down");
    for (const row of rows) {
      this.rows.push({
        id: `ntf_${++seq}`,
        body: null,
        targetType: null,
        targetId: null,
        link: null,
        readAt: null,
        createdAt: new Date(),
        ...row,
      });
    }
  }
  async listForUser(
    userId: string,
    tenantId: string,
    limit: number,
  ): Promise<NotificationRecord[]> {
    return this.rows
      .filter((r) => r.userId === userId && r.tenantId === tenantId)
      .reverse()
      .slice(0, limit);
  }
  async countUnread(userId: string, tenantId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.tenantId === tenantId && !r.readAt)
      .length;
  }
  async markRead(id: string, userId: string): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (!row) return false;
    // Re-stamped unconditionally, matching `updateMany` in the Prisma repo — the second `read()` of
    // an already-read row moves the timestamp. Do NOT "fix" this to `??=`: a fake that is kinder
    // than the database lets a test assert something production does not do.
    row.readAt = new Date();
    return true;
  }
  async markAllRead(userId: string, tenantId: string): Promise<number> {
    const rows = this.rows.filter(
      (r) => r.userId === userId && r.tenantId === tenantId && !r.readAt,
    );
    for (const row of rows) row.readAt = new Date();
    return rows.length;
  }

  /** Test helper: seed a row directly (the fan-out path is tested through `emitCaseEvent`). */
  seed(row: NewNotification): NotificationRecord {
    const stored: NotificationRecord = {
      id: `ntf_${++seq}`,
      body: null,
      targetType: null,
      targetId: null,
      link: null,
      readAt: null,
      createdAt: new Date(),
      ...row,
    };
    this.rows.push(stored);
    return stored;
  }
}

const ME = "user-me";
const OTHER = "user-other";
const TENANT = FakeTenantRepo.tenantIdFor(ME);
const OTHER_TENANT = "tnt_elsewhere";

let repo: FakeNotificationRepo;
let tenants: FakeTenantRepo;
let service: NotificationsService;
/** Who `resolveRole` refuses — the "lost access since being cast" case. */
let denied: Set<string>;

function event(overrides: Partial<CaseEvent> = {}): CaseEvent {
  return {
    kind: "case.advanced",
    tenantId: TENANT,
    actorId: ME,
    recipientIds: [OTHER],
    case: {
      id: "inst-1",
      projectId: "proj-1",
      workflowId: "wf-1",
      label: "Đơn nghỉ phép",
      statusLabel: "review",
    },
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
  repo = new FakeNotificationRepo();
  tenants = new FakeTenantRepo();
  tenants.join(ME, TENANT);
  tenants.join(OTHER, TENANT);
  denied = new Set();
  const projects = {
    resolveRole: async (userId: string) => (denied.has(userId) ? null : "editor"),
  } as unknown as ProjectsService;
  service = new NotificationsService(repo, tenants, projects);
});

describe("NotificationsService — the inbox is per-caller", () => {
  it("returns only the caller's own rows", async () => {
    repo.seed({ userId: ME, tenantId: TENANT, kind: "case.assigned", title: "Của tôi" });
    repo.seed({ userId: OTHER, tenantId: TENANT, kind: "case.assigned", title: "Của người khác" });

    const rows = await service.list(ME);
    expect(rows.map((r) => r.title)).toEqual(["Của tôi"]);
  });

  it("scopes the feed and the badge to the workspace being looked at", async () => {
    repo.seed({ userId: ME, tenantId: TENANT, kind: "case.assigned", title: "Ở đây" });
    repo.seed({ userId: ME, tenantId: OTHER_TENANT, kind: "case.assigned", title: "Chỗ khác" });

    expect((await service.list(ME)).map((r) => r.title)).toEqual(["Ở đây"]);
    expect(await service.unreadCount(ME)).toBe(1);

    // Switching workspace (X-Tenant-Id) shows the other one — but only because ME is a member.
    tenants.join(ME, OTHER_TENANT);
    expect((await service.list(ME, 20, OTHER_TENANT)).map((r) => r.title)).toEqual(["Chỗ khác"]);
    expect(await service.unreadCount(ME, OTHER_TENANT)).toBe(1);
  });

  it("falls back to the caller's own workspace when the header names one they don't belong to", async () => {
    repo.seed({ userId: ME, tenantId: TENANT, kind: "case.assigned", title: "Ở đây" });
    // Not a member of OTHER_TENANT: `resolveTenantForUser` ignores the header rather than obeying it.
    expect((await service.list(ME, 20, OTHER_TENANT)).map((r) => r.title)).toEqual(["Ở đây"]);
  });

  it("caps the page size no matter what the caller asks for", async () => {
    const spy = vi.spyOn(repo, "listForUser");
    await service.list(ME, MAX_NOTIFICATION_LIMIT + 500);
    expect(spy).toHaveBeenCalledWith(ME, TENANT, MAX_NOTIFICATION_LIMIT);
  });

  it("returns an empty feed for a user with no workspace at all", async () => {
    expect(await service.list("nobody")).toEqual([]);
    expect(await service.unreadCount("nobody")).toBe(0);
    expect(await service.readAll("nobody")).toEqual({ updated: 0 });
  });
});

describe("NotificationsService — marking read cannot reach another inbox", () => {
  it("404s on someone else's notification AND leaves it unread", async () => {
    const theirs = repo.seed({
      userId: OTHER,
      tenantId: TENANT,
      kind: "case.assigned",
      title: "Của người khác",
    });

    await expect(service.read(ME, theirs.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.rows.find((r) => r.id === theirs.id)?.readAt).toBeNull();
  });

  it("404s on an id that does not exist (same answer — no existence oracle)", async () => {
    await expect(service.read(ME, "ntf_nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("marks the caller's own row read, and reading it again is not an error", async () => {
    const mine = repo.seed({ userId: ME, tenantId: TENANT, kind: "case.assigned", title: "T" });
    await service.read(ME, mine.id);
    expect(repo.rows[0].readAt).not.toBeNull();

    // Idempotent in the only sense the store actually guarantees: still read, still 204. The
    // timestamp itself is NOT asserted — `updateMany` re-stamps it, and the badge only cares
    // whether `readAt` is null.
    await service.read(ME, mine.id);
    expect(repo.rows[0].readAt).not.toBeNull();
    expect(await service.unreadCount(ME)).toBe(0);
  });

  it("read-all touches only the caller's rows in the active workspace", async () => {
    repo.seed({ userId: ME, tenantId: TENANT, kind: "k", title: "mine-here" });
    repo.seed({ userId: ME, tenantId: OTHER_TENANT, kind: "k", title: "mine-elsewhere" });
    repo.seed({ userId: OTHER, tenantId: TENANT, kind: "k", title: "theirs" });

    expect(await service.readAll(ME)).toEqual({ updated: 1 });
    expect(repo.rows.filter((r) => r.readAt).map((r) => r.title)).toEqual(["mine-here"]);
  });
});

describe("NotificationsService.emitCaseEvent — the delivery rules", () => {
  it("writes one row per recipient with the case link and the snapshot title", async () => {
    await service.emitCaseEvent(event({ recipientIds: [OTHER] }));

    expect(repo.rows).toEqual([
      expect.objectContaining({
        userId: OTHER,
        tenantId: TENANT,
        kind: "case.advanced",
        title: "Việc đã chuyển bước: Đơn nghỉ phép",
        body: "Trạng thái mới: review",
        targetType: "workflow-instance",
        targetId: "inst-1",
        link: "/projects/proj-1/workflows/wf-1/run/inst-1",
      }),
    ]);
  });

  it("never notifies the actor about their own action", async () => {
    await service.emitCaseEvent(event({ recipientIds: [ME] }));
    expect(repo.rows).toEqual([]);
  });

  it("dedupes a recipient who appears twice (cast AND responsible)", async () => {
    await service.emitCaseEvent(event({ recipientIds: [OTHER, OTHER] }));
    expect(repo.rows).toHaveLength(1);
  });

  it("drops a recipient who can no longer open the project", async () => {
    denied.add(OTHER);
    await service.emitCaseEvent(event({ recipientIds: [OTHER] }));
    expect(repo.rows).toEqual([]);
  });

  it("labels a cast with the role, and an assignment as an assignment", async () => {
    await service.emitCaseEvent(
      event({ kind: "case.participant-added", recipientIds: [OTHER], roleCode: "hr" }),
    );
    await service.emitCaseEvent(event({ kind: "case.assigned", recipientIds: [OTHER] }));

    expect(repo.rows.map((r) => [r.title, r.body])).toEqual([
      ["Bạn được cử tham gia việc: Đơn nghỉ phép", "Vai trò: hr"],
      ["Bạn được giao việc: Đơn nghỉ phép", "Trạng thái: review"],
    ]);
  });

  it("says (chưa có nhãn) rather than reaching into the case data for a title", async () => {
    await service.emitCaseEvent(
      event({ case: { ...event().case, label: null, statusLabel: null } }),
    );
    expect(repo.rows[0]).toMatchObject({
      title: "Việc đã chuyển bước: (chưa có nhãn)",
      body: null,
    });
  });

  it("swallows a store failure — a notification must never fail the work it describes", async () => {
    repo.failWrites = true;
    await expect(service.emitCaseEvent(event())).resolves.toBeUndefined();
  });

  it("writes nothing when the event concerns nobody", async () => {
    const spy = vi.spyOn(repo, "createMany");
    await service.emitCaseEvent(event({ recipientIds: [] }));
    expect(spy).not.toHaveBeenCalled();
  });
});
