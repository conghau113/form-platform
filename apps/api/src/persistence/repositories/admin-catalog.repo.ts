import type { FormSummary } from "./form.repo.js";
import type { FormVersionSummary } from "./form-version.repo.js";
import type { WorkflowSummary } from "./workflow.repo.js";
import type { WorkflowInstanceSummary } from "./workflow-instance.repo.js";

/** A form summary enriched with its project's name — the tenant-wide admin list (D2). */
export interface AdminFormRow extends FormSummary {
  projectName: string;
}

/** A workflow summary enriched with its project's name — the tenant-wide admin list (D3). */
export interface AdminWorkflowRow extends WorkflowSummary {
  projectName: string;
}

/** A version summary enriched with its parent form + project names — the admin list (D4). */
export interface AdminFormVersionRow extends FormVersionSummary {
  formTitle: string;
  projectName: string;
}

/** An instance summary enriched with its parent workflow + project names — the admin list (D4). */
export interface AdminWorkflowInstanceRow extends WorkflowInstanceSummary {
  workflowTitle: string;
  projectName: string;
}

/**
 * Read-only, tenant-wide catalog for the admin panels (product-roadmap D2–D4). Kept separate from
 * the per-project domain repos so the cross-project "list everything in the tenant" concern lives in
 * one place (and the many domain-repo test fakes stay untouched). Every method scopes strictly by
 * `tenantId` via the `project` relation — the FunctionGuard (`form.admin`/`workflow.admin`) plus this
 * scoping are what keep one tenant's catalog invisible to another. No writes: admin panels list + link.
 */
export abstract class AdminCatalogRepo {
  /** Every form across the tenant's projects, most-recently-updated first (D2). */
  abstract listForms(tenantId: string): Promise<AdminFormRow[]>;
  /** Every workflow across the tenant's projects, most-recently-updated first (D3). */
  abstract listWorkflows(tenantId: string): Promise<AdminWorkflowRow[]>;
  /** Every published form version across the tenant's projects, most-recent first (D4). */
  abstract listFormVersions(tenantId: string): Promise<AdminFormVersionRow[]>;
  /** Every running workflow case across the tenant's projects, most-recently-updated first (D4). */
  abstract listInstances(tenantId: string): Promise<AdminWorkflowInstanceRow[]>;
}
