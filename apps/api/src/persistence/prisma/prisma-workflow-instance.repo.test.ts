import { createInstance } from "@org/workflow-core";
import type { WorkflowInstance } from "@org/workflow-schema";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowInstanceMeta } from "../repositories/workflow-instance.repo.js";
import type { PrismaService } from "./prisma.service.js";
import { PrismaWorkflowInstanceRepo } from "./prisma-workflow-instance.repo.js";

/**
 * The optimistic-concurrency guard (E3b, parallel track) lives in the ARGUMENTS this repo hands Prisma — `rev` in
 * the `where`, `increment` in the `data`. The service tests exercise the rule against a fake repo,
 * which proves the service reacts to a lost race but says nothing about whether the real write is
 * conditional at all: drop `rev` from the `where` here and every one of them still passes.
 *
 * So these tests drive the real repo over a stubbed Prisma client and assert on the query it built.
 * They are change-detectors by nature; the live smoke in the phase log is what confirms the query
 * does what it claims against a real Postgres.
 */
function repoWith(updateMany: ReturnType<typeof vi.fn>): PrismaWorkflowInstanceRepo {
  const prisma = { workflowInstanceRecord: { updateMany } } as unknown as PrismaService;
  return new PrismaWorkflowInstanceRepo(prisma);
}

/**
 * Built by the engine rather than hand-written: a literal that merely satisfies the compiler is not
 * a valid instance, and this test asserts the body travels through the write untouched — so it has
 * to be a body the contract would actually accept.
 */
function instance(): WorkflowInstance {
  return createInstance(
    {
      workflowVersion: 1,
      id: "wf1",
      title: "Approval",
      start: "draft",
      nodes: [{ id: "draft", status: "draft" }],
      transitions: [],
    },
    { id: "case-1" },
  );
}

const meta: WorkflowInstanceMeta = {
  workflowId: "wf1",
  projectId: "proj-1",
  label: "Mai",
  statusLabel: "Đang duyệt",
  statusKind: "normal",
};

describe("PrismaWorkflowInstanceRepo.update — optimistic concurrency (E3b, parallel track)", () => {
  it("writes only when the row is still at the revision it was read at, and bumps it", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const stored = await repoWith(updateMany).update(instance(), meta, 7);

    expect(stored).not.toBeNull();
    const arg = updateMany.mock.calls[0]?.[0];
    // BOTH halves of the condition: `id` alone would make the write unconditional again.
    expect(arg.where).toEqual({ id: "case-1", rev: 7 });
    // `increment` rather than `rev: 8` — the row is only ever advanced from what it actually holds.
    expect(arg.data.rev).toEqual({ increment: 1 });
    // The body still travels with the write; the guard is added to it, not swapped for it.
    expect(arg.data.body).toEqual(instance());
  });

  it("reports a lost race as `null` rather than throwing or claiming the write happened", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(repoWith(updateMany).update(instance(), meta, 7)).resolves.toBeNull();
  });

  it("starts a new case without stating a revision, so the column default applies", async () => {
    // `update` spreads `rev: { increment: 1 }` AFTER `writeData`, so a `rev` smuggled into the
    // shared `writeData` would be invisible there while silently changing what `create` inserts.
    const create = vi.fn().mockResolvedValue({});
    const prisma = { workflowInstanceRecord: { create } } as unknown as PrismaService;
    await new PrismaWorkflowInstanceRepo(prisma).create(instance(), meta);
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty("rev");
  });
});

describe("PrismaWorkflowInstanceRepo.load — the read half of the guard (E3b, parallel track)", () => {
  /**
   * `rev` is only useful as a PAIR: read-at, then write-if-still-at. Pinning the write half alone
   * leaves the read free to return a constant — which every test above and every service test would
   * still pass, while production 409s every case from its second advance onwards.
   */
  function repoReading(record: unknown): PrismaWorkflowInstanceRepo {
    const findUnique = vi.fn().mockResolvedValue(record);
    return new PrismaWorkflowInstanceRepo({
      workflowInstanceRecord: { findUnique },
    } as unknown as PrismaService);
  }

  it("hands back the row's own revision, not a default", async () => {
    // Deliberately neither 0 nor 1: a hardcoded starting value has to fail this.
    const stored = await repoReading({ body: instance(), rev: 7 }).load("case-1");
    expect(stored).toEqual({ instance: instance(), rev: 7 });
  });

  it("returns null for an absent case, so the service can still answer 404", async () => {
    await expect(repoReading(null).load("ghost")).resolves.toBeNull();
  });
});

describe("PrismaWorkflowInstanceRepo — column-only writes leave `rev` alone (E3b, parallel track)", () => {
  /**
   * `setAssignee` and `setWorkOrderFields` write work-order metadata, not body state. If they
   * touched `rev` they would fail whatever action someone is in the middle of with a 409 that has
   * nothing to do with the case having moved.
   */
  it("does not touch `rev` when assigning or when setting the deadline/urgency", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = { workflowInstanceRecord: { update } } as unknown as PrismaService;
    const repo = new PrismaWorkflowInstanceRepo(prisma);

    await repo.setAssignee("case-1", "user-9");
    await repo.setWorkOrderFields("case-1", { dueAt: new Date(0), priority: 3 });

    for (const call of update.mock.calls) {
      expect(call[0].data).not.toHaveProperty("rev");
    }
    expect(update).toHaveBeenCalledTimes(2);
  });
});
