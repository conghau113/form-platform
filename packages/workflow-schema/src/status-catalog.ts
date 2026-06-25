import { z } from "zod";

/**
 * A **status catalog entry**: a named, reusable workflow status (WE4). It is the master-data
 * cousin of a node's inline `status` label — a stable `code` plus a human `label`, the engine
 * {@link StatusKind} it belongs to, and an optional custom `color`. Workflows reference it from a
 * node by {@link WorkflowNode.statusCode}; the node also keeps a frozen `status`/`kind` snapshot so
 * a deleted catalog entry never breaks a saved definition (same denorm character as form-schema's
 * linked fields, W4).
 *
 * IMPORTANT: a catalog entry is **organisational master data, not workflow JSON**. It lives OUTSIDE
 * the workflow contract and is decoupled from {@link CURRENT_WORKFLOW_VERSION} — changing this shape
 * never requires a workflowVersion bump or a migration (exactly like form-schema's `Preset`).
 */

/**
 * The fixed, engine-meaningful category of a status. This is the small CLOSED set the engine can
 * reason about (validation + default colour) — the canonical two-tier model (cf. Jira's 3 fixed
 * status categories with unlimited custom statuses mapped onto them):
 * - `start`  — an entry state (the definition's `start` names one).
 * - `normal` — a regular in-progress state.
 * - `end`    — a terminal state (no outgoing transitions).
 * Users get unlimited CUSTOM statuses via catalog entries; each maps onto one of these kinds. Kind
 * stays closed because the engine cannot reason about semantics it doesn't know. "Optional/skippable
 * step" is a ROUTING concern (model with a bypass transition), not a status kind.
 */
export type StatusKind = "start" | "normal" | "end";

/**
 * Where a catalog entry is visible (mirrors form-schema `PresetScope`, W3). `"global"` entries show
 * in every project; `"project"` entries show only inside their {@link StatusCatalogEntry.projectId}.
 * Absent ⇒ `"global"`. Organisational metadata — it lives on the entry, NOT inside any workflow
 * contract, so it never touches `CURRENT_WORKFLOW_VERSION`.
 */
export type StatusCatalogScope = "global" | "project";

export interface StatusCatalogEntry {
  /** Stable code (also the storage key + the value a node references via `statusCode`). */
  code: string;
  /** Human label shown on the node and in pickers (e.g. `"Chờ duyệt"`). */
  label: string;
  /** The engine category this status belongs to (drives validation + default colour). */
  kind: StatusKind;
  /** Optional custom colour (hex/token) overriding the kind default. Master data, NOT contract. */
  color?: string;
  /** Visibility scope (W3 pattern). Absent ⇒ global. */
  scope?: StatusCatalogScope;
  /** Owning project — required iff `scope === "project"`; ignored/cleared otherwise. */
  projectId?: string;
}

/** The closed set of engine status kinds, as a runtime tuple (for Zod + UI iteration). */
export const STATUS_KINDS = ["start", "normal", "end"] as const satisfies readonly StatusKind[];

/**
 * Validator for a status catalog entry. `code` is a simple identifier (same character as a preset
 * id — it is a storage key and a node reference). `color` is an opaque string (hex or design
 * token), not cross-validated here. `scope`/`projectId` mirror the preset invariant: a `"project"`
 * entry must carry a `projectId`.
 */
export const statusCatalogEntrySchema = z
  .object({
    code: z.string().regex(/^[a-zA-Z0-9_-]+$/, "code must be a simple identifier"),
    label: z.string().min(1),
    kind: z.enum(STATUS_KINDS),
    color: z.string().min(1).optional(),
    scope: z.enum(["global", "project"]).optional(),
    projectId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.scope === "project" && !val.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required when scope is 'project'",
        path: ["projectId"],
      });
    }
  }) satisfies z.ZodType<StatusCatalogEntry>;

/** Validate an unknown body as a {@link StatusCatalogEntry}; throws on invalid (mirrors `migrate`). */
export function parseStatusCatalogEntry(body: unknown): StatusCatalogEntry {
  return statusCatalogEntrySchema.parse(body);
}
