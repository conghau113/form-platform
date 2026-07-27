import { Controller, Get } from "@nestjs/common";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import { RequireFunction } from "../../auth/require-function.decorator.js";
import type {
  AdminFormRow,
  AdminFormVersionRow,
  AdminWorkflowInstanceRow,
  AdminWorkflowRow,
} from "../../persistence/repositories/admin-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { AdminCatalogService } from "./admin-catalog.service.js";

/**
 * Tenant-wide admin catalog API (product-roadmap D2–D4). All routes are function-gated by the global
 * {@link FunctionGuard} (`form.admin` / `workflow.admin`) and scoped to the caller's tenant in the
 * service — defense-in-depth on top of the client-side nav gating. Read-only: the admin panels list
 * everything in the tenant and link into the existing per-project editors; there are no writes here.
 */
@Controller("admin")
export class AdminCatalogController {
  constructor(private readonly admin: AdminCatalogService) {}

  /** Every form in the caller's tenant, across all projects (D2). */
  @Get("forms")
  @RequireFunction("form.admin")
  listForms(@CurrentOwner() userId: string): Promise<AdminFormRow[]> {
    return this.admin.listForms(userId);
  }

  /** Every workflow in the caller's tenant, across all projects (D3). */
  @Get("workflows")
  @RequireFunction("workflow.admin")
  listWorkflows(@CurrentOwner() userId: string): Promise<AdminWorkflowRow[]> {
    return this.admin.listWorkflows(userId);
  }

  /** Every published form version in the caller's tenant (D4). */
  @Get("form-versions")
  @RequireFunction("form.admin")
  listFormVersions(@CurrentOwner() userId: string): Promise<AdminFormVersionRow[]> {
    return this.admin.listFormVersions(userId);
  }

  /** Every running workflow case in the caller's tenant (D4). */
  @Get("workflow-instances")
  @RequireFunction("workflow.admin")
  listInstances(@CurrentOwner() userId: string): Promise<AdminWorkflowInstanceRow[]> {
    return this.admin.listInstances(userId);
  }
}
