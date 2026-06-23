import type { WorkflowDefinition } from "@org/workflow-schema";

/** Where a workflow sits in the workspace — org metadata that lives OUTSIDE the workflow contract. */
export interface WorkflowUpsertMeta {
  projectId: string;
  folderId?: string | null;
}

/** Query for listing a folder's (or project's) workflows. Omit `folderId` for the whole project. */
export interface WorkflowListQuery {
  projectId: string;
  /** `null` → project-root workflows only; `undefined` → all workflows in the project. */
  folderId?: string | null;
}

/** Org-index summary of a workflow (no body) — cheap to list a folder without parsing every body. */
export interface WorkflowSummary {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: Date;
}

/**
 * Persistence boundary for workflow bodies (D4: services depend on this interface, never on
 * Prisma). The stored `body` is the already-migrated contract; the repo only stores/loads it and
 * the org index alongside — it never validates (that is the service's `migrateWorkflow()` gate).
 * Mirrors {@link FormRepo}.
 */
export abstract class WorkflowRepo {
  /** Upsert by `definition.id`; returns the stored contract. */
  abstract upsert(def: WorkflowDefinition, meta: WorkflowUpsertMeta): Promise<WorkflowDefinition>;
  /** Load a workflow contract by id, or `null` when absent (service maps null → 404). */
  abstract load(id: string): Promise<WorkflowDefinition | null>;
  /** The org-index summary of a workflow (no body), or `null` — for placement/ownership checks. */
  abstract findSummary(id: string): Promise<WorkflowSummary | null>;
  /** List workflow summaries (no body) for a project/folder, most-recently-updated first. */
  abstract listSummaries(query: WorkflowListQuery): Promise<WorkflowSummary[]>;
  /** Move a workflow to another folder within its project (`null` → project root). */
  abstract move(id: string, folderId: string | null): Promise<WorkflowSummary | null>;
  /** Delete a workflow by id; no-op if already absent. */
  abstract delete(id: string): Promise<void>;
}
