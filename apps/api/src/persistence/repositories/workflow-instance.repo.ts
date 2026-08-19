import type { WorkflowInstance } from "@org/workflow-schema";

/**
 * Parent links + denormalised display state written on every instance write — deliberately all
 * REQUIRED. `update` writes each of these columns unconditionally, so an optional field would be
 * silently NULLed by any call site that forgot it. `assigneeId` is pointedly NOT here: it is owned
 * by {@link WorkflowInstanceRepo.setAssignee} alone, so running a case never disturbs who it belongs
 * to. `dueAt`/`priority` (Phase E2) follow the same rule via
 * {@link WorkflowInstanceRepo.setWorkOrderFields} — work-order metadata is not engine state, and
 * advancing a case must never wipe its deadline.
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

/**
 * A stored case plus the storage revision it was read at (E3b, parallel track) — the token {@link
 * WorkflowInstanceRepo.update} demands back before it will write.
 *
 * `load` returns the pair rather than the bare instance so there is exactly ONE read path, and no
 * second, rev-less variant a write could be built on by accident.
 */
export interface StoredInstance {
  instance: WorkflowInstance;
  /** Bumped by every body write; `update` refuses when it no longer matches. */
  rev: number;
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
  /** When the case is due (Phase E2), or null when no deadline was set. */
  dueAt: Date | null;
  /** Urgency (Phase E2): 1 = low, 2 = normal, 3 = high. Never null — the column defaults to 2. */
  priority: number;
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
  /** Exact urgency (Phase E2): 1 | 2 | 3. */
  priority?: number;
  /**
   * Keep only cases overdue as at this instant — `dueAt` before it AND the case not finished
   * (Phase E2).
   *
   * Deliberately ONE field carrying the cutoff rather than an `overdue: boolean` plus a separate
   * `now`: two independent fields let `overdue: true` arrive with the cutoff missing, which Prisma
   * would render as `dueAt < undefined` — a condition it silently DROPS, quietly turning the filter
   * into "every unfinished case". Here the cutoff's presence IS the switch, so it cannot go missing.
   * The caller supplies the clock so this stays testable.
   */
  overdueBefore?: Date;
}

/** Server-side paging for the work-order list. `label` is NOT sortable — it is frequently null. */
export interface WorkOrderPage {
  offset: number;
  limit: number;
  sort: "updatedAt" | "createdAt" | "current" | "dueAt" | "priority";
  dir: "asc" | "desc";
}

/**
 * Persistence boundary for workflow instances (D4: services depend on this interface, never on
 * Prisma). The stored `body` is the `WorkflowInstance` contract produced by the pure engine
 * (`createInstance`/`advance`); the repo only stores/loads it plus the org index — it never runs
 * the engine. Mirrors {@link WorkflowRepo}.
 */
export abstract class WorkflowInstanceRepo {
  /**
   * Write the body of an EXISTING case, but only if it is still at `expectedRev` (E3b, parallel track); returns the
   * stored instance, or `null` when the write did not happen. Never touches `assigneeId`.
   *
   * `expectedRev` must come from the {@link load} of the same request — it is what makes the write
   * conditional on the state the caller actually reasoned about. Passing a constant compiles and
   * usually appears to work, which is exactly why callers must not.
   *
   * `null` means "rev no longer matches" OR "the row is gone", deliberately not distinguished: the
   * second is only reachable by cascade from deleting the workflow or the project (`delete` below
   * has no callers), and one extra query to tell a 409 from a 404 on a path nobody walks is not
   * worth the code. The service maps `null` → 409, mirroring {@link create}'s convention so both
   * write paths report a lost race the same way and neither leaks a Prisma error type.
   *
   * NOTE: this used to be an `upsert`, which would silently RE-CREATE a case deleted mid-advance.
   * It no longer inserts.
   */
  abstract update(
    instance: WorkflowInstance,
    meta: WorkflowInstanceMeta,
    expectedRev: number,
  ): Promise<WorkflowInstance | null>;
  /**
   * Insert a NEW case, or return `null` when `instance.id` is already taken.
   *
   * Starting a case must never go through {@link update}: that writes by id, so a collision would
   * silently REWRITE the existing case (and drag it into the caller's project) instead of failing.
   * The "does it exist?" check the service does first still races — two concurrent starts can both
   * see "free" — so the insert itself has to be the decider. Returning `null` rather than throwing
   * keeps Prisma's error types out of the service, which maps `null` → 409.
   *
   * NOTE: `null` means "id taken" only because `id` is the record's ONLY unique constraint. Adding an
   * `@@unique` to the model would make this branch report the wrong conflict — narrow it then.
   */
  abstract create(
    instance: WorkflowInstance,
    meta: WorkflowInstanceMeta,
  ): Promise<WorkflowInstance | null>;
  /**
   * Load an instance by id together with its revision, or `null` when absent (service maps null →
   * 404). The `rev` comes from the SAME read as the body, so a caller that goes on to write cannot
   * compare against a revision the body it holds never had.
   */
  abstract load(id: string): Promise<StoredInstance | null>;
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
  /**
   * Write the work-order attributes (Phase E2). Only the keys PRESENT in `patch` are written, so
   * setting a deadline never resets the urgency; `dueAt: null` clears the deadline.
   *
   * Separate from {@link update} on purpose — see {@link WorkflowInstanceMeta}. It also must NOT
   * bump `rev`: work-order metadata is not body state, and assigning a case while someone is acting
   * on it would otherwise fail their action with a spurious 409.
   */
  abstract setWorkOrderFields(
    id: string,
    patch: { dueAt?: Date | null; priority?: number },
  ): Promise<void>;
  /** Delete an instance by id; no-op if already absent. */
  abstract delete(id: string): Promise<void>;
}
