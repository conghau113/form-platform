import dagre from "@dagrejs/dagre";
import type { FlowEdge, FlowNode } from "./workflow-model";

/** Fallback node size used when xyflow hasn't measured a node yet (e.g. right after creation). */
const NODE_W = 180;
const NODE_H = 64;

/** Separation between siblings within one rank — and between side-lane states sharing the lane. */
const NODE_SEP = 72;

/** A node's rendered size, or the fallback while xyflow has yet to measure it. */
function sizeOf(node: FlowNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? NODE_W,
    height: node.measured?.height ?? NODE_H,
  };
}

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
 * Which way `tidyLayout` grows the graph: `LR` = left-to-right columns, `TB` = top-to-bottom rows.
 *
 * Deliberately NOT part of the workflow JSON contract: `position` is the only presentation data the
 * contract carries, and it already records the outcome — a graph arranged vertically reopens
 * vertically because every node kept its coordinates. This is the editor's momentary choice, not
 * the workflow's property.
 */
export type LayoutDirection = "LR" | "TB";

/** How many DISTINCT states must drain into a terminal state before it is treated as a side lane. */
const SIDE_LANE_MIN_SOURCES = 3;

/** Gap between the main graph's far edge and the side lane's column (or row, under `LR`). */
const SIDE_LANE_GAP = 160;

/**
 * PURE. The terminal states that are collection points rather than steps of the flow: no outgoing
 * transition, and at least three DISTINCT states draining into them.
 *
 * Ranking one of these with everything else is what makes a cancel branch unreadable. dagre ranks by
 * longest path, so a state every step can bail out to is pushed BELOW every state that drains into
 * it — measured on the demo workflow (TB), `cancelled` lands at rank 7 of 10 (y=1581) while its five
 * sources sit at ranks 2–6, so the five arrows run 277px to 1329px back down the spine and the
 * longest of them crosses four states on the way. Parked beside the spine instead, at the middle of
 * the states it drains, the same five arrows fan out into the margin.
 *
 * Distinct SOURCES, not edge count: three transitions leaving one state for the same terminal (three
 * ways to cancel from one step) is one branch point, not a collection point. `done` in the demo, with
 * a single incoming transition, must stay on the spine — it is the end of the flow, not a sink beside it.
 *
 * Sources that do not EXIST are not counted either. `applyGenerated` tidies UNVALIDATED model output,
 * where a transition can name a state that was never emitted; counting those would promote an ordinary
 * terminal to a collection point, pull it out of dagre, and then leave it exactly where it came in
 * (`placeSideLane` has nothing real to centre it on) — one card parked on top of another.
 */
export function sideLaneSinks(nodes: FlowNode[], edges: FlowEdge[]): Set<string> {
  const known = new Set(nodes.map((n) => n.id));
  const sources = new Map<string, Set<string>>();
  const hasOutgoing = new Set<string>();
  for (const e of edges) {
    hasOutgoing.add(e.source);
    if (!known.has(e.source)) continue;
    let into = sources.get(e.target);
    if (!into) {
      into = new Set();
      sources.set(e.target, into);
    }
    into.add(e.source);
  }
  const sinks = new Set<string>();
  for (const n of nodes) {
    if (hasOutgoing.has(n.id)) continue;
    if ((sources.get(n.id)?.size ?? 0) >= SIDE_LANE_MIN_SOURCES) sinks.add(n.id);
  }
  return sinks;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Auto-arrange the graph with dagre, left-to-right by default. PURE: returns NEW nodes with
 * refreshed positions (xyflow's top-left origin) and leaves ids/data/edges untouched, so the caller
 * can `setNodes(tidyLayout(...))` and the change flows through `fromFlow` like any manual drag.
 */
export function tidyLayout(
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: LayoutDirection = "LR",
): FlowNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  // Looser spacing than the original 48/96 so a multi-level approval graph reads without
  // edges and labels colliding (`ranksep` separates the ranks — columns under LR, rows under TB —
  // and `nodesep` separates siblings within one). The same numbers serve both directions: dagre
  // reports label sizes in FINAL coordinates, so the reserved slot follows `rankdir` on its own.
  // `align: "UL"` keeps the spine straight. dagre's default averages four alignments, which centres
  // a node over its children — so the moment one state branches, the main run of the workflow kinks
  // sideways and the reader loses it. Measured on the demo workflow (11 nodes, 17 transitions):
  // by default 3/11 nodes shared a column under TB and 4/11 under LR, against 10/11 with "UL" in
  // both; and the graph got narrower across too — 531→496px under TB, 294→245px under LR.
  // Confirmed in the running
  // editor with its real, unequal node widths (168–234px): ten node CENTRES land on x=117–118 and
  // only the `cancelled` side branch sits apart. Compare centres, not left edges — unequal widths
  // make the left edges differ even when the column is perfectly straight.
  g.setGraph({ rankdir: direction, align: "UL", nodesep: NODE_SEP, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));

  // Collection points are laid out by hand afterwards, so they are kept OUT of dagre entirely —
  // both the state and every transition touching it. Leaving them in is what drags them (and their
  // whole fan of incoming transitions) below every state that drains into them.
  // dagre is always left something to rank: a collection point needs three sources that EXIST, and
  // a source has an outgoing transition, so a source is never itself a collection point — three
  // ranked states therefore survive for every sink pulled out. No "everything is a sink" case.
  const sinks = sideLaneSinks(nodes, edges);

  for (const n of nodes) {
    if (sinks.has(n.id)) continue;
    g.setNode(n.id, sizeOf(n));
  }
  for (const e of edges) {
    // The same guard that drops dangling transitions also drops every transition into a side lane,
    // because the lane's state is not in the graph — no separate check needed, and `setEdge` would
    // otherwise conjure the missing state back as an unsized node.
    if (!(g.hasNode(e.source) && g.hasNode(e.target))) continue;
    // Reserve space for the edge's label so dagre routes columns around it instead of letting it
    // overlap a node; bare edges stay tight (`{}`).
    // NOTE: transitions into a side lane lose this reservation along with their state. Measured on
    // the demo workflow: labels landing on a state stayed at 1 of 17 either way.
    const size = estimateEdgeLabelSize(e);
    g.setEdge(e.source, e.target, size ? { ...size, labelpos: "c" } : {});
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (sinks.has(n.id)) continue;
    const p = g.node(n.id);
    if (!p) continue;
    // dagre reports node centers; xyflow positions are top-left.
    positions.set(n.id, {
      x: Math.round(p.x - p.width / 2),
      y: Math.round(p.y - p.height / 2),
    });
  }

  if (sinks.size > 0) {
    placeSideLane(sinks, nodes, edges, direction, positions);
  }

  return nodes.map((n) => {
    const position = positions.get(n.id);
    return position ? { ...n, position } : n;
  });
}

/**
 * Park each collection point in one shared lane just past the far edge of the laid-out graph,
 * centred on the states draining into it. Mutates `positions` in place — it is `tidyLayout`'s own
 * scratch map, built one statement earlier and never shared.
 *
 * `positions` is never empty here, and every collection point always finds at least three sources in
 * it, so neither `far` nor `median` can be handed nothing: a collection point needs three sources
 * that EXIST (`sideLaneSinks`), each such source has an outgoing transition and so is not itself a
 * collection point, and every non-collection-point node was ranked by dagre and is therefore in
 * `positions`. Guards for those two cases were written, measured to be unreachable (removing them
 * left the suite green), and deleted rather than left as ungated decoration.
 */
function placeSideLane(
  sinks: Set<string>,
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: LayoutDirection,
  positions: Map<string, { x: number; y: number }>,
): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const vertical = direction === "TB";

  // The lane sits past the FAR EDGE, not past the far origin: node widths differ (168–234px in the
  // running editor), so measuring from `x` alone would drop the lane on top of a wide state.
  let far = Number.NEGATIVE_INFINITY;
  for (const [id, p] of positions) {
    const node = byId.get(id);
    if (!node) continue;
    const size = sizeOf(node);
    far = Math.max(far, vertical ? p.x + size.width : p.y + size.height);
  }
  const lane = Math.round(far + SIDE_LANE_GAP);

  // Median of the sources' CENTRES — with unequal node sizes the top-left corner is not the middle.
  const placed: { id: string; centre: number; size: number }[] = [];
  for (const id of sinks) {
    const node = byId.get(id);
    if (!node) continue;
    const centres: number[] = [];
    for (const e of edges) {
      if (e.target !== id) continue;
      const p = positions.get(e.source);
      const source = byId.get(e.source);
      // A dangling transition names a state that does not exist — `validateGraph` reports those, and
      // `applyGenerated` tidies UNVALIDATED model output, so this is a live state, not a theory.
      // It is skipped here AND never counted toward the ≥3 threshold (see `sideLaneSinks`), so what
      // survives this loop is exactly the real sources — at least three of them.
      if (!(p && source)) continue;
      const s = sizeOf(source);
      centres.push(vertical ? p.y + s.height / 2 : p.x + s.width / 2);
    }
    const size = sizeOf(node);
    placed.push({ id, centre: median(centres), size: vertical ? size.height : size.width });
  }

  // Several collection points share the one lane, so walk them in order and push each clear of the
  // last — two cancel-like states draining overlapping parts of the flow would otherwise stack up.
  placed.sort((a, b) => a.centre - b.centre);
  let occupiedTo = Number.NEGATIVE_INFINITY;
  for (const p of placed) {
    const start = Math.max(Math.round(p.centre - p.size / 2), occupiedTo + NODE_SEP);
    occupiedTo = start + p.size;
    positions.set(p.id, vertical ? { x: lane, y: start } : { x: start, y: lane });
  }
}
