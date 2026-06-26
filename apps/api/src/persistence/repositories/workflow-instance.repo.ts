import type { WorkflowInstance } from "@org/workflow-schema";

/** Parent links for an instance — denormalised so access control never loads the definition. */
export interface WorkflowInstanceMeta {
  workflowId: string;
  projectId: string;
}

/** Cheap org-index of a running case (no body) — list a workflow's cases without parsing each. */
export interface WorkflowInstanceSummary {
  id: string;
  workflowId: string;
  projectId: string;
  current: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Persistence boundary for workflow instances (D4: services depend on this interface, never on
 * Prisma). The stored `body` is the `WorkflowInstance` contract produced by the pure engine
 * (`createInstance`/`advance`); the repo only stores/loads it plus the org index — it never runs
 * the engine. Mirrors {@link WorkflowRepo}.
 */
export abstract class WorkflowInstanceRepo {
  /** Upsert by `instance.id`; returns the stored instance. */
  abstract upsert(
    instance: WorkflowInstance,
    meta: WorkflowInstanceMeta,
  ): Promise<WorkflowInstance>;
  /** Load an instance by id, or `null` when absent (service maps null → 404). */
  abstract load(id: string): Promise<WorkflowInstance | null>;
  /** The org-index summary of an instance (no body), or `null` — for access checks. */
  abstract findSummary(id: string): Promise<WorkflowInstanceSummary | null>;
  /** List instance summaries for a workflow, most-recently-updated first. */
  abstract listByWorkflow(workflowId: string): Promise<WorkflowInstanceSummary[]>;
  /** Delete an instance by id; no-op if already absent. */
  abstract delete(id: string): Promise<void>;
}
