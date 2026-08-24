import { CURRENT_WORKFLOW_VERSION } from "./schema.js";

/**
 * P0 — machine-readable workflow primitive catalog (mirrors form-schema's
 * `capabilities.ts`). Describes the building blocks an agent composes into a
 * `WorkflowDefinition`, so it can author one WITHOUT parsing the Zod schema.
 * Metadata ABOUT the contract, not part of it.
 */

/** The structural primitives of a workflow definition. */
export type WorkflowPrimitiveKind = "node" | "transition" | "guard";

export interface WorkflowPrimitive {
  readonly kind: WorkflowPrimitiveKind;
  /** Required keys an author must supply for this primitive. */
  readonly required: readonly string[];
  /** Optional keys this primitive accepts. */
  readonly optional: readonly string[];
  /** One-line, machine-and-human readable description. */
  readonly summary: string;
}

/** Every primitive a workflow definition is built from. */
export const WORKFLOW_PRIMITIVES: readonly WorkflowPrimitive[] = [
  {
    kind: "node",
    required: ["id", "status"],
    optional: ["defaultAssignee", "formId", "gateway", "i18n", "kind", "position", "statusCode"],
    summary:
      "A state in the workflow. `status` is the human label; `formId` binds a form (by id) shown in that state. `statusCode` references a project status catalog entry; `kind` (start|normal|end) is a frozen category snapshot for colour fallback. `i18n` localizes the `status` label per locale. `defaultAssignee` ({kind: role|user, value}) is who the state is expected to land on — a SUGGESTION only, never a permission: the engine never consults it, and `transition.role` is the only thing it checks the actor against. `gateway` (fork|join) marks a parallel-flow gateway — do NOT emit it: the engine executes forks and joins and malformed ones are now rejected at save time, but the editor has no gateway authoring UI yet, so a gateway you write in cannot be removed or retargeted in the editor afterwards. Model concurrency-free paths only.",
  },
  {
    kind: "transition",
    required: ["id", "from", "to", "action"],
    optional: ["guard", "i18n", "role"],
    summary:
      "A directed edge between nodes. `action` is the event that fires it; `guard` (JSONLogic) and `role` gate it. `i18n` localizes the action's display LABEL per locale — `action` itself stays the engine identifier.",
  },
  {
    kind: "guard",
    required: ["rule"],
    optional: [],
    summary: "A JSONLogic condition on a transition, evaluated by a SAFE evaluator (never eval()).",
  },
];

/** Top-level required/optional keys of a workflow definition. */
export const WORKFLOW_DEFINITION_SHAPE = {
  required: ["workflowVersion", "id", "title", "start", "nodes", "transitions"],
  optional: ["defaultLocale", "i18n", "locales"],
  /** `start` must name an existing node id; transitions' `from`/`to` reference node ids. */
  notes:
    "`start` names the entry node id. Nodes reference forms by id. Transitions reference node ids in `from`/`to`. `i18n` localizes the `title`; `defaultLocale`/`locales` declare the languages offered.",
} as const;

/**
 * The catalog as a single agent-facing payload: the contract version, the
 * definition shape, and the primitive list. This is what an MCP "describe
 * workflow" tool returns.
 */
export function workflowCapabilities(): {
  workflowVersion: number;
  definition: typeof WORKFLOW_DEFINITION_SHAPE;
  primitives: readonly WorkflowPrimitive[];
} {
  return {
    workflowVersion: CURRENT_WORKFLOW_VERSION,
    definition: WORKFLOW_DEFINITION_SHAPE,
    primitives: WORKFLOW_PRIMITIVES,
  };
}
