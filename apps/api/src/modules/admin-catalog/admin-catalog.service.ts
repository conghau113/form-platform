import { Injectable } from "@nestjs/common";
import type {
  AdminFormRow,
  AdminFormVersionRow,
  AdminWorkflowInstanceRow,
  AdminWorkflowRow,
} from "../../persistence/repositories/admin-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AdminCatalogRepo } from "../../persistence/repositories/admin-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";

/**
 * Read-side of the tenant-wide admin panels (product-roadmap D2–D4). Resolves the caller's **active**
 * tenant (`resolveTenantForUser` — the selected workspace, else the personal-first default) and
 * returns everything in it. The function gate lives on the controller (`form.admin`/`workflow.admin`);
 * this only lists. A user with no tenant (shouldn't happen for an authenticated caller — every user
 * has a personal tenant per B1) gets an empty list rather than a leak.
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly catalog: AdminCatalogRepo,
    private readonly tenants: TenantRepo,
  ) {}

  async listForms(userId: string, activeTenantId?: string): Promise<AdminFormRow[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    return tenantId ? this.catalog.listForms(tenantId) : [];
  }

  async listWorkflows(userId: string, activeTenantId?: string): Promise<AdminWorkflowRow[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    return tenantId ? this.catalog.listWorkflows(tenantId) : [];
  }

  async listFormVersions(userId: string, activeTenantId?: string): Promise<AdminFormVersionRow[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    return tenantId ? this.catalog.listFormVersions(tenantId) : [];
  }

  async listInstances(
    userId: string,
    activeTenantId?: string,
  ): Promise<AdminWorkflowInstanceRow[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    return tenantId ? this.catalog.listInstances(tenantId) : [];
  }
}
