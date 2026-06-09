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
