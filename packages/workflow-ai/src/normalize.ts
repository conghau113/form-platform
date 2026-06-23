import { validateGraph } from "@org/workflow-core";
import {
  CURRENT_WORKFLOW_VERSION,
  migrateWorkflow,
  type WorkflowDefinition,
} from "@org/workflow-schema";
import { ZodError } from "zod";

/**
 * Turn an LLM-authored draft into a contract-valid AND graph-valid
 * `WorkflowDefinition`, or structured errors. This is the moat in one function:
 *
 *   stamp version → migrate → Zod parse (shape valid) → `validateGraph`
 *   (reachability / no dangling edges / single start)
 *
 * Both gates report into the SAME `errors` channel, so the shared
 * `runValidationLoop` feeds graph problems back to the model exactly like Zod
 * problems — no special-casing in the loop. The result is guaranteed safe to run
 * (no eval; guards stay JSONLogic) and well-formed as a graph.
 */
export type NormalizeWorkflowResult =
  | { ok: true; value: WorkflowDefinition }
  | { ok: false; errors: string[] };

/** Flatten any thrown error (ZodError or otherwise) into human-readable lines. */
export function workflowErrorLines(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}

/** Stamp the current `workflowVersion` onto a draft that omits it, so the model
 *  can author the body and let the contract own versioning. Non-objects pass
 *  through to let `migrateWorkflow` report a precise error. */
function withWorkflowVersion(draft: unknown): unknown {
  if (draft !== null && typeof draft === "object" && !Array.isArray(draft)) {
    const obj = draft as Record<string, unknown>;
    if (typeof obj.workflowVersion !== "number") {
      return { ...obj, workflowVersion: CURRENT_WORKFLOW_VERSION };
    }
  }
  return draft;
}

/** Validate & normalize a workflow draft into a guaranteed-valid definition. */
export function normalizeWorkflowDraft(draft: unknown): NormalizeWorkflowResult {
  let value: WorkflowDefinition;
  try {
    value = migrateWorkflow(withWorkflowVersion(draft));
  } catch (error) {
    return { ok: false, errors: workflowErrorLines(error) };
  }

  // Shape is valid; now the graph must be well-formed. Surface graph errors
  // through the same channel so they drive a repair round.
  const graphErrors = validateGraph(value);
  if (graphErrors.length > 0) {
    return { ok: false, errors: graphErrors.map((e) => e.message) };
  }
  return { ok: true, value };
}
