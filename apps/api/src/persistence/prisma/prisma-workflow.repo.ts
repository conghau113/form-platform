import { Injectable } from "@nestjs/common";
import type { WorkflowDefinition } from "@org/workflow-schema";
import type { Prisma, WorkflowRecord } from "@prisma/client";
import {
  type WorkflowListQuery,
  WorkflowRepo,
  type WorkflowSummary,
  type WorkflowUpsertMeta,
} from "../repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Columns that make up a {@link WorkflowSummary} — selected to avoid loading the (large) body. */
const summarySelect = {
  id: true,
  projectId: true,
  folderId: true,
  title: true,
  status: true,
  updatedAt: true,
} as const;

type SummaryRow = Pick<WorkflowRecord, keyof typeof summarySelect>;

function toSummary(r: SummaryRow): WorkflowSummary {
  return {
    id: r.id,
    projectId: r.projectId,
    folderId: r.folderId,
    title: r.title,
    status: r.status,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class PrismaWorkflowRepo extends WorkflowRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(def: WorkflowDefinition, meta: WorkflowUpsertMeta): Promise<WorkflowDefinition> {
    const data = {
      projectId: meta.projectId,
      folderId: meta.folderId ?? null,
      title: def.title,
      body: def as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.workflowRecord.upsert({
      where: { id: def.id },
      update: data,
      create: { id: def.id, ...data },
    });
    return def;
  }

  async load(id: string): Promise<WorkflowDefinition | null> {
    const record = await this.prisma.workflowRecord.findUnique({ where: { id } });
    return record ? (record.body as unknown as WorkflowDefinition) : null;
  }

  async findSummary(id: string): Promise<WorkflowSummary | null> {
    const row = await this.prisma.workflowRecord.findUnique({
      where: { id },
      select: summarySelect,
    });
    return row ? toSummary(row) : null;
  }

  async listSummaries(query: WorkflowListQuery): Promise<WorkflowSummary[]> {
    const rows = await this.prisma.workflowRecord.findMany({
      where: {
        projectId: query.projectId,
        // `undefined` → all workflows in the project; `null` → project-root workflows only.
        ...(query.folderId !== undefined ? { folderId: query.folderId } : {}),
      },
      select: summarySelect,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toSummary);
  }

  async move(id: string, folderId: string | null): Promise<WorkflowSummary | null> {
    const row = await this.prisma.workflowRecord.update({
      where: { id },
      data: { folderId },
      select: summarySelect,
    });
    return toSummary(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.workflowRecord.deleteMany({ where: { id } });
  }
}
