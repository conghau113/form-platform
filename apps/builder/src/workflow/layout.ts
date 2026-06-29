import dagre from "@dagrejs/dagre";
import type { FlowEdge, FlowNode } from "./workflow-model";

/** Fallback node size used when xyflow hasn't measured a node yet (e.g. right after creation). */
const NODE_W = 180;
const NODE_H = 64;

/**
 * Estimate an edge's rendered label box (action label + optional role/guard chips, stacked) so dagre
 * can reserve a rank slot for it (#6). Without this dagre lays out as if edges are bare and a centred
 * label collides with a node when columns are tight. PURE; returns `null` for a label-less edge.
 * Dimensions mirror `floating-edge.tsx`: the action box ≈26px tall, each chip ≈22px, capped ~150 wide.
 */
function estimateEdgeLabelSize(edge: FlowEdge): { width: number; height: number } | null {
  let height = 0;
  if (edge.label) height += 26;
  if (edge.data?.role) height += 22;
  if (edge.data?.guard) height += 22;
  if (height === 0) return null;
  return { width: 150, height };
}

/**
 * Auto-arrange the graph left-to-right with dagre. PURE: returns NEW nodes with refreshed
 * positions (xyflow's top-left origin) and leaves ids/data/edges untouched, so the caller can
 * `setNodes(tidyLayout(...))` and the change flows through `fromFlow` like any manual drag.
 */
export function tidyLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  // Looser spacing than the original 48/96 so a multi-level approval graph reads without
  // edges and labels colliding (ranksep is the gap between LR columns; nodesep within a column).
  g.setGraph({ rankdir: "LR", nodesep: 72, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.measured?.width ?? NODE_W,
      height: n.measured?.height ?? NODE_H,
    });
  }
  for (const e of edges) {
    if (!(g.hasNode(e.source) && g.hasNode(e.target))) continue;
    // Reserve space for the edge's label so dagre routes columns around it instead of letting it
    // overlap a node; bare edges stay tight (`{}`).
    const size = estimateEdgeLabelSize(e);
    g.setEdge(e.source, e.target, size ? { ...size, labelpos: "c" } : {});
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    if (!p) return n;
    // dagre reports node centers; xyflow positions are top-left.
    return {
      ...n,
      position: { x: Math.round(p.x - p.width / 2), y: Math.round(p.y - p.height / 2) },
    };
  });
}
