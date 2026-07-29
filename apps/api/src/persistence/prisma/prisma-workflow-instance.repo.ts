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
  };
}

@Injectable()
export class PrismaWorkflowInstanceRepo extends WorkflowInstanceRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(instance: WorkflowInstance, meta: WorkflowInstanceMeta): Promise<WorkflowInstance> {
    // NOTE: every key here is written on update too, so nothing the case owns elsewhere may appear
    // in this object — `assigneeId` in particular is only ever written by `setAssignee`.
    const data = {
      workflowId: meta.workflowId,
      projectId: meta.projectId,
      current: instance.current,
      label: meta.label,
      statusLabel: meta.statusLabel,
      statusKind: meta.statusKind,
      body: instance as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.workflowInstanceRecord.upsert({
      where: { id: instance.id },
      update: data,
      create: { id: instance.id, ...data },
    });
    return instance;
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
        // Stable tiebreaker: without it, rows with an identical sort value can repeat or vanish
        // between pages.
        orderBy: [{ [page.sort]: page.dir }, { id: "asc" }],
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

  async delete(id: string): Promise<void> {
    await this.prisma.workflowInstanceRecord.deleteMany({ where: { id } });
  }
}
