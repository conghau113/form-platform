/**
 * Pure upstream trace for the editor's "highlight path" affordance: from a clicked state, walk
 * transitions backwards to every state that can reach it (ultimately the start). Returns the node
 * and edge ids on those paths so the editor can emphasize them and dim the rest. No React, no
 * xyflow — unit-tested on plain ids. Cycle-safe (a `visited` set bounds the walk).
 */

/** The only edge shape the trace needs (a FlowEdge is structurally assignable). */
export interface TraceEdge {
  id: string;
  source: string;
  target: string;
}

export interface Trace {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

/** All node + edge ids on any path from an upstream state into `targetId` (inclusive). */
export function traceUpstream(targetId: string, edges: TraceEdge[]): Trace {
  // incoming[id] = transitions whose target is `id`.
  const incoming = new Map<string, TraceEdge[]>();
  for (const e of edges) {
    const list = incoming.get(e.target);
    if (list) list.push(e);
    else incoming.set(e.target, [e]);
  }

  const nodeIds = new Set<string>([targetId]);
  const edgeIds = new Set<string>();
  const frontier = [targetId];
  while (frontier.length > 0) {
    const id = frontier.pop();
    if (id === undefined) break;
    for (const e of incoming.get(id) ?? []) {
      edgeIds.add(e.id);
      if (!nodeIds.has(e.source)) {
        nodeIds.add(e.source);
        frontier.push(e.source);
      }
    }
  }
  return { nodeIds, edgeIds };
}
