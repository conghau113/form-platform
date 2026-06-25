import type { WorkflowDefinition } from "@org/workflow-schema";

export type GraphErrorCode =
  | "duplicate-node"
  | "start-missing"
  | "dangling-transition"
  | "unreachable";

export interface GraphError {
  code: GraphErrorCode;
  message: string;
  /** The offending node or transition id, when applicable. */
  ref?: string;
}

/**
 * Structural validation of a workflow definition. Returns [] when the graph is
 * sound. Checks: unique node ids, a single existing `start` node, every
 * transition references existing nodes, and every node is reachable from `start`
 * (BFS over transitions). Used by the editor before export.
 */
export function validateGraph(def: WorkflowDefinition): GraphError[] {
  const errors: GraphError[] = [];

  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const node of def.nodes) {
    if (seen.has(node.id)) {
      errors.push({
        code: "duplicate-node",
        message: `Duplicate node id "${node.id}".`,
        ref: node.id,
      });
    }
    seen.add(node.id);
    ids.add(node.id);
  }

  if (!ids.has(def.start)) {
    errors.push({
      code: "start-missing",
      message: `Start node "${def.start}" does not exist.`,
      ref: def.start,
    });
  }

  for (const t of def.transitions) {
    if (!ids.has(t.from) || !ids.has(t.to)) {
      errors.push({
        code: "dangling-transition",
        message: `Transition "${t.id}" references a missing node (${t.from} → ${t.to}).`,
        ref: t.id,
      });
    }
  }

  // Reachability is only meaningful once `start` is real.
  if (ids.has(def.start)) {
    const adjacency = new Map<string, string[]>();
    for (const t of def.transitions) {
      if (ids.has(t.from) && ids.has(t.to)) {
        (adjacency.get(t.from) ?? adjacency.set(t.from, []).get(t.from)!).push(t.to);
      }
    }
    const reachable = new Set<string>([def.start]);
    const queue = [def.start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }
    for (const node of def.nodes) {
      if (!reachable.has(node.id)) {
        errors.push({
          code: "unreachable",
          message: `Node "${node.id}" is not reachable from start "${def.start}".`,
          ref: node.id,
        });
      }
    }
  }

  return errors;
}

/** Advisory (non-blocking) lint codes. Unlike {@link GraphErrorCode}, these never gate save or the
 *  AI normalize/repair loop — they flag a graph that parses and runs but is probably a mistake. */
export type GraphWarningCode = "dead-end" | "end-has-outgoing";

export interface GraphWarning {
  code: GraphWarningCode;
  message: string;
  /** The offending node id. */
  ref?: string;
}

/**
 * Advisory structural checks, kept SEPARATE from {@link validateGraph} on purpose: the editor's save
 * gate and the AI moat (`normalizeWorkflowDraft` → repair loop) treat every `validateGraph` error as
 * fatal, so these "suspicious but runnable" findings must NOT live there. Returns [] for a clean
 * graph. Uses the WE4 `kind` snapshot (start/normal/end); old definitions without `kind` are left
 * alone so a kind-less terminal never gets nagged.
 *
 *   - `dead-end`: a node expected to continue (the start node, or `kind` start/normal) has no
 *     outgoing transition. Suppressed for a single-node draft (nothing to flag yet).
 *   - `end-has-outgoing`: a `kind: "end"` node still has an outgoing transition.
 */
export function lintGraph(def: WorkflowDefinition): GraphWarning[] {
  const warnings: GraphWarning[] = [];
  // A trivial one-node draft is incomplete by construction — don't nag.
  if (def.nodes.length <= 1) return warnings;

  const hasOutgoing = new Set(def.transitions.map((t) => t.from));

  for (const node of def.nodes) {
    const out = hasOutgoing.has(node.id);

    // dead-end: expected to continue but goes nowhere.
    const expectedToContinue =
      node.id === def.start || node.kind === "start" || node.kind === "normal";
    if (!out && expectedToContinue) {
      warnings.push({
        code: "dead-end",
        message: `Node "${node.id}" has no outgoing transition, so the workflow cannot continue past it.`,
        ref: node.id,
      });
    }

    // end-has-outgoing: a terminal state that still leads somewhere.
    if (out && node.kind === "end") {
      warnings.push({
        code: "end-has-outgoing",
        message: `End node "${node.id}" still has an outgoing transition.`,
        ref: node.id,
      });
    }
  }

  return warnings;
}
