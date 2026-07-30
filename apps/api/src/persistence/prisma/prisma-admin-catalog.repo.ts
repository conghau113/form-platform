import { Injectable } from "@nestjs/common";
import {
  AdminCatalogRepo,
  type AdminFormRow,
  type AdminFormVersionRow,
  type AdminWorkflowInstanceRow,
  type AdminWorkflowRow,
} from "../repositories/admin-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

/**
 * Prisma-backed tenant-wide admin catalog (D2–D4). Each query scopes by the `project` relation's
 * `tenantId` and joins in the project's (and parent form/workflow's) name for the admin table; bodies
 * are never selected (cheap listing).
 */
@Injectable()
export class PrismaAdminCatalogRepo extends AdminCatalogRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForms(tenantId: string): Promise<AdminFormRow[]> {
    const rows = await this.prisma.formRecord.findMany({
      where: { project: { tenantId } },
      select: {
        id: true,
        projectId: true,
        folderId: true,
        title: true,
        status: true,
        updatedAt: true,
        project: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      folderId: r.folderId,
      title: r.title,
      status: r.status,
      updatedAt: r.updatedAt,
      projectName: r.project.name,
    }));
  }

  async listWorkflows(tenantId: string): Promise<AdminWorkflowRow[]> {
    const rows = await this.prisma.workflowRecord.findMany({
      where: { project: { tenantId } },
      select: {
        id: true,
        projectId: true,
        folderId: true,
        title: true,
        status: true,
        updatedAt: true,
        project: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      folderId: r.folderId,
      title: r.title,
      status: r.status,
      updatedAt: r.updatedAt,
      projectName: r.project.name,
    }));
  }

  async listFormVersions(tenantId: string): Promise<AdminFormVersionRow[]> {
    const rows = await this.prisma.formVersionRecord.findMany({
      where: { project: { tenantId } },
      select: {
        id: true,
        formId: true,
        projectId: true,
        version: true,
        formVersion: true,
        publishedBy: true,
        publishedAt: true,
        form: { select: { title: true } },
        project: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      formId: r.formId,
      projectId: r.projectId,
      version: r.version,
      formVersion: r.formVersion,
      publishedBy: r.publishedBy,
      publishedAt: r.publishedAt,
      formTitle: r.form.title,
      projectName: r.project.name,
    }));
  }

  async listInstances(tenantId: string): Promise<AdminWorkflowInstanceRow[]> {
    const rows = await this.prisma.workflowInstanceRecord.findMany({
      where: { project: { tenantId } },
      select: {
        id: true,
        workflowId: true,
        projectId: true,
        current: true,
        label: true,
        // Phase E denormalized columns: `AdminWorkflowInstanceRow` extends the shared case summary,
        // so the admin catalog carries them too. Harmless — the admin tab simply doesn't render them.
        assigneeId: true,
        statusLabel: true,
        statusKind: true,
        dueAt: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        workflow: { select: { title: true } },
        project: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => ({
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
      workflowTitle: r.workflow.title,
      projectName: r.project.name,
    }));
  }
}
