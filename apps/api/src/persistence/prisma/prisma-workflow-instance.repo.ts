import { Injectable } from "@nestjs/common";
import type { WorkflowInstance } from "@org/workflow-schema";
import type { Prisma, WorkflowInstanceRecord } from "@prisma/client";
import {
  type WorkflowInstanceMeta,
  WorkflowInstanceRepo,
  type WorkflowInstanceSummary,
  type WorkOrderFilter,
  type WorkOrderPage,
  type WorkOrderRow,
} from "../repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Columns that make up a {@link WorkflowInstanceSummary} — selected to avoid loading the body. */
const summarySelect = {
  id: true,
  workflowId: true,
  projectId: true,
  current: true,
  label: true,
  assigneeId: true,
  statusLabel: true,
  statusKind: true,
  dueAt: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** The summary columns plus the names a work-order row shows — one nested select, no N+1. */
const rowSelect = {
  ...summarySelect,
  workflow: { select: { title: true } },
  project: { select: { name: true } },
  assignee: { select: { displayName: true, email: true } },
} as const;

type SummaryRow = Pick<WorkflowInstanceRecord, keyof typeof summarySelect>;
type OrderRow = SummaryRow & {
  workflow: { title: string };
  project: { name: string };
  assignee: { displayName: string | null; email: string } | null;
};

function toSummary(r: SummaryRow): WorkflowInstanceSummary {
  return {
    id: r.id,
    workflowId: r.workflowId,
    projectId: r.projectId,
    current: r.current,
    label: r.label,
    assigneeId: r.assigneeId,
    statusLabel: r.statusLabel,
    statusKind: r.statusKind,
    dueAt: r.dueAt,
    priority: r.priority,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toRow(r: OrderRow): WorkOrderRow {
  return {
    ...toSummary(r),
    workflowTitle: r.workflow.title,
    projectName: r.project.name,
    assigneeName: r.assignee ? (r.assignee.displayName ?? r.assignee.email) : null,
  };
}

/** The one `where` shared by the page query and its count, so `total` can never disagree. */
function buildWhere(
  projectIds: string[],
  filter: WorkOrderFilter,
): Prisma.WorkflowInstanceRecordWhereInput {
  return {
    projectId: { in: projectIds },
    ...(filter.workflowId ? { workflowId: filter.workflowId } : {}),
    ...(filter.current ? { current: filter.current } : {}),
    ...(filter.statusKind ? { statusKind: filter.statusKind } : {}),
    ...(filter.unassigned ? { assigneeId: null } : {}),
    ...(filter.assigneeId && !filter.unassigned ? { assigneeId: filter.assigneeId } : {}),
    ...(filter.search ? { label: { contains: filter.search, mode: "insensitive" as const } } : {}),
    ...(filter.priority !== undefined ? { priority: filter.priority } : {}),
    ...(filter.overdueBefore
      ? {
          AND: [
            { dueAt: { lt: filter.overdueBefore } },
            // "Not finished" has to spell out the NULL case: `statusKind` is nullable (cases written
            // before Phase E never got one), and SQL's `statusKind <> 'end'` evaluates to NULL for
            // those rows, which excludes them — so an overdue legacy case would go unreported.
            { OR: [{ statusKind: null }, { statusKind: { not: "end" } }] },
          ],
        }
      : {}),
  };
}

/**
 * `orderBy` for one page. `dueAt` needs the extended form so NULLs can be pinned LAST: Postgres puts
 * them FIRST on a DESC sort, which would open "latest deadline first" with every case that has NO
 * deadline — indistinguishable from a broken sort. The other columns are non-null, so they keep the
 * short form.
 */
function buildOrderBy(
  page: WorkOrderPage,
): Prisma.WorkflowInstanceRecordOrderByWithRelationInput[] {
  const primary: Prisma.WorkflowInstanceRecordOrderByWithRelationInput =
    page.sort === "dueAt"
      ? { dueAt: { sort: page.dir, nulls: "last" } }
      : { [page.sort]: page.dir };
  // Stable tiebreaker: without it, rows with an identical sort value can repeat or vanish between
  // pages.
  return [primary, { id: "asc" }];
}

/**
 * The columns an instance write owns, shared by `upsert` and `create` so the two can never drift.
 *
 * NOTE: every key here is written on UPDATE too, so nothing the case owns elsewhere may appear in
 * this object — `assigneeId` in particular is only ever written by `setAssignee`, and `dueAt`/
 * `priority` only by `setWorkOrderFields`.
 */
function writeData(instance: WorkflowInstance, meta: WorkflowInstanceMeta) {
  return {
    workflowId: meta.workflowId,
    projectId: meta.projectId,
    current: instance.current,
    label: meta.label,
    statusLabel: meta.statusLabel,
    statusKind: meta.statusKind,
    body: instance as unknown as Prisma.InputJsonValue,
  };
}

@Injectable()
export class PrismaWorkflowInstanceRepo extends WorkflowInstanceRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(instance: WorkflowInstance, meta: WorkflowInstanceMeta): Promise<WorkflowInstance> {
    const data = writeData(instance, meta);
    await this.prisma.workflowInstanceRecord.upsert({
      where: { id: instance.id },
      update: data,
      create: { id: instance.id, ...data },
    });
    return instance;
  }

  async create(
    instance: WorkflowInstance,
    meta: WorkflowInstanceMeta,
  ): Promise<WorkflowInstance | null> {
    try {
      await this.prisma.workflowInstanceRecord.create({
        data: { id: instance.id, ...writeData(instance, meta) },
      });
      return instance;
    } catch (err) {
      // P2002 = unique violation, i.e. the id is taken. Anything else is a real failure.
      if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
        return null;
      }
      throw err;
    }
  }

  async load(id: string): Promise<WorkflowInstance | null> {
    const record = await this.prisma.workflowInstanceRecord.findUnique({ where: { id } });
    return record ? (record.body as unknown as WorkflowInstance) : null;
  }

  async findSummary(id: string): Promise<WorkflowInstanceSummary | null> {
    const row = await this.prisma.workflowInstanceRecord.findUnique({
      where: { id },
      select: summarySelect,
    });
    return row ? toSummary(row) : null;
  }

  async listByWorkflow(workflowId: string): Promise<WorkflowInstanceSummary[]> {
    const rows = await this.prisma.workflowInstanceRecord.findMany({
      where: { workflowId },
      select: summarySelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toSummary);
  }

  async listByProjects(
    projectIds: string[],
    filter: WorkOrderFilter,
    page: WorkOrderPage,
  ): Promise<{ rows: WorkOrderRow[]; total: number }> {
    if (projectIds.length === 0) return { rows: [], total: 0 };
    const where = buildWhere(projectIds, filter);
    const [rows, total] = await Promise.all([
      this.prisma.workflowInstanceRecord.findMany({
        where,
        select: rowSelect,
        orderBy: buildOrderBy(page),
        skip: page.offset,
        take: page.limit,
      }),
      this.prisma.workflowInstanceRecord.count({ where }),
    ]);
    return { rows: rows.map(toRow), total };
  }

  async setAssignee(id: string, assigneeId: string | null): Promise<void> {
    await this.prisma.workflowInstanceRecord.update({ where: { id }, data: { assigneeId } });
  }

  async setWorkOrderFields(
    id: string,
    patch: { dueAt?: Date | null; priority?: number },
  ): Promise<void> {
    // Spread only the keys that are present: an absent `priority` must stay untouched, while an
    // explicit `dueAt: null` must clear the deadline.
    await this.prisma.workflowInstanceRecord.update({
      where: { id },
      data: {
        ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workflowInstanceRecord.deleteMany({ where: { id } });
  }
}
