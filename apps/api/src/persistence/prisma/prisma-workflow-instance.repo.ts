import { Injectable } from "@nestjs/common";
import type { WorkflowInstance } from "@org/workflow-schema";
import type { Prisma, WorkflowInstanceRecord } from "@prisma/client";
import {
  type WorkflowInstanceMeta,
  WorkflowInstanceRepo,
  type WorkflowInstanceSummary,
} from "../repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/** Columns that make up a {@link WorkflowInstanceSummary} — selected to avoid loading the body. */
const summarySelect = {
  id: true,
  workflowId: true,
  projectId: true,
  current: true,
  createdAt: true,
  updatedAt: true,
} as const;

type SummaryRow = Pick<WorkflowInstanceRecord, keyof typeof summarySelect>;

function toSummary(r: SummaryRow): WorkflowInstanceSummary {
  return {
    id: r.id,
    workflowId: r.workflowId,
    projectId: r.projectId,
    current: r.current,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class PrismaWorkflowInstanceRepo extends WorkflowInstanceRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async upsert(instance: WorkflowInstance, meta: WorkflowInstanceMeta): Promise<WorkflowInstance> {
    const data = {
      workflowId: meta.workflowId,
      projectId: meta.projectId,
      current: instance.current,
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

  async delete(id: string): Promise<void> {
    await this.prisma.workflowInstanceRecord.deleteMany({ where: { id } });
  }
}
