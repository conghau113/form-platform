import type { WorkflowInstance } from "@org/workflow-schema";

/**
 * Parent links + denormalised display state written on every instance write — deliberately all
 * REQUIRED. `upsert` writes each of these columns unconditionally, so an optional field would be
 * silently NULLed by any call site that forgot it. `assigneeId` is pointedly NOT here: it is owned
 * by {@link WorkflowInstanceRepo.setAssignee} alone, so running a case never disturbs who it belongs
 * to.
 */
export interface WorkflowInstanceMeta {
  workflowId: string;
  projectId: string;
  /**
   * Human label for the case, derived by the SERVICE from the case data with every role-gated field
   * removed. It is computed there rather than here because only the service can resolve the forms
   * the workflow binds — and because one stored label is shown to every reader (list, email,
   * `?q=` search), so it must never carry a value some of them may not view.
   */
  label: string | null;
  /** The current node's human status label, snapshotted from the definition (Phase E). */
  statusLabel: string | null;
  /** The current node's engine category — `start` | `normal` | `end` — or null when unset. */
  statusKind: string | null;
}

/** Cheap org-index of a running case (no body) — list a workflow's cases without parsing each. */
export interface WorkflowInstanceSummary {
  id: string;
  workflowId: string;
  projectId: string;
  current: string;
  /** Denormalized label derived from the case data (#1), or null when none could be derived. */
  label: string | null;
  /** Who the case is currently assigned to (Phase E), or null when unassigned. */
  assigneeId: string | null;
  statusLabel: string | null;
  statusKind: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A case enriched with the names a work-order list shows (Phase E) — one query, no N+1. */
export interface WorkOrderRow extends WorkflowInstanceSummary {
  workflowTitle: string;
  projectName: string;
  /** Display name (falling back to email) of the assignee, or null when unassigned/unknown. */
  assigneeName: string | null;
}

/** Work-order list filters. `assigneeId` and `unassigned` are mutually exclusive. */
export interface WorkOrderFilter {
  workflowId?: string;
  current?: string;
  statusKind?: string;
  assigneeId?: string;
  unassigned?: boolean;
  /** Case-insensitive substring of the denormalized `label`. */
  search?: string;
}

/** Server-side paging for the work-order list. `label` is NOT sortable — it is frequently null. */
export interface WorkOrderPage {
  offset: number;
  limit: number;
  sort: "updatedAt" | "createdAt" | "current";
  dir: "asc" | "desc";
}

/**
 * Persistence boundary for workflow instances (D4: services depend on this interface, never on
 * Prisma). The stored `body` is the `WorkflowInstance` contract produced by the pure engine
 * (`createInstance`/`advance`); the repo only stores/loads it plus the org index — it never runs
 * the engine. Mirrors {@link WorkflowRepo}.
 */
export abstract class WorkflowInstanceRepo {
  /** Upsert by `instance.id`; returns the stored instance. Never touches `assigneeId`. */
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
  /**
   * One page of cases across many projects, plus the total matching the same filter (Phase E work
   * -order list). The CALLER decides which projects it may see — this repo applies no access rules.
   * An empty `projectIds` yields an empty page.
   */
  abstract listByProjects(
    projectIds: string[],
    filter: WorkOrderFilter,
    page: WorkOrderPage,
  ): Promise<{ rows: WorkOrderRow[]; total: number }>;
  /** Set (or clear, with `null`) the case's assignee. */
  abstract setAssignee(id: string, assigneeId: string | null): Promise<void>;
  /** Delete an instance by id; no-op if already absent. */
  abstract delete(id: string): Promise<void>;
}
