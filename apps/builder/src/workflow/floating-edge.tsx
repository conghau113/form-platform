import { FilterOutlined, UserOutlined } from "@ant-design/icons";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
  type InternalNode,
  type Node,
  Position,
  useInternalNode,
  useStore,
} from "@xyflow/react";
import { createContext, type ReactNode, useContext } from "react";
import { shortGuard, summarizeGuard } from "./edge-summary";
import type { FlowEdgeData } from "./workflow-model";

/** Upstream path highlight — colour + dim only; stroke width stays constant on node click. */
export interface PathHighlightCtx {
  edgeIds: ReadonlySet<string> | null;
}
export const PathHighlightContext = createContext<PathHighlightCtx>({ edgeIds: null });

/** Default edge stroke (editor presentation — not in the contract). */
export const EDGE_STROKE = "#b1b3bb";
export const EDGE_STROKE_WIDTH = 1.5;

/** A node's absolute box in flow coordinates (top-left origin + size), the input geometry needs. */
export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getNodeIntersection(node: NodeBox, other: NodeBox): { x: number; y: number } {
  const w = node.width / 2;
  const h = node.height / 2;
  const cx = node.x + w;
  const cy = node.y + h;
  const ox = other.x + other.width / 2;
  const oy = other.y + other.height / 2;

  const xx1 = (ox - cx) / (2 * w) - (oy - cy) / (2 * h);
  const yy1 = (ox - cx) / (2 * w) + (oy - cy) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + cx, y: h * (-xx3 + yy3) + cy };
}

function getEdgePosition(node: NodeBox, p: { x: number; y: number }): Position {
  const nx = Math.round(node.x);
  const ny = Math.round(node.y);
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  if (px <= nx + 1) return Position.Left;
  if (px >= nx + node.width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + node.height - 1) return Position.Bottom;
  return Position.Top;
}

export interface EdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
}

/**
 * PURE. Endpoints anchored to the MIDDLE of the two facing sides, or `null` when the boxes overlap
 * on both axes and so have no facing sides.
 *
 * The axis chosen is the one the boxes are CLOSER on, which is the whole point: leave through the
 * narrow gap, then travel along the wide one. An orthogonal route runs its long leg down the
 * corridor BETWEEN two columns, and dagre leaves that corridor empty by construction. Measured on
 * the demo workflow (11 states, 17 transitions), `created → cancelled` has a 160px horizontal gap
 * against a 552px vertical one: leaving sideways puts the long vertical leg inside that 160px
 * corridor, while the obvious "follow the dominant displacement" rule leaves downwards and drags
 * the horizontal leg straight through the middle of the state column. That is what the graph does
 * today, and it costs 5 of 17 transitions crossing a third state's box; this rule costs 1 — the
 * same figure under both `LR` and `TB`.
 *
 * The remaining one is `finished → locked` skipping `leader_signed` in the SAME column: no choice of
 * anchor can help when the corridor is the occupied one. It stays visible instead, via the edge
 * z-index.
 *
 * Boxes far apart horizontally but close vertically get a top/bottom route, which reads oddly at
 * first glance. It is the same trade deliberately: the narrow gap is the empty one.
 */
export function axisEdgeParams(source: NodeBox, target: NodeBox): EdgeParams | null {
  // Negative gap = the boxes overlap on that axis, so that pair of sides does not face each other.
  const gapX =
    Math.max(source.x, target.x) - Math.min(source.x + source.width, target.x + target.width);
  const gapY =
    Math.max(source.y, target.y) - Math.min(source.y + source.height, target.y + target.height);

  let horizontal: boolean;
  if (gapX >= 0 && gapY >= 0) horizontal = gapX <= gapY;
  else if (gapX >= 0) horizontal = true;
  else if (gapY >= 0) horizontal = false;
  else return null;

  const scx = source.x + source.width / 2;
  const scy = source.y + source.height / 2;
  const tcx = target.x + target.width / 2;
  const tcy = target.y + target.height / 2;

  if (horizontal) {
    const rightwards = tcx > scx;
    return {
      sx: rightwards ? source.x + source.width : source.x,
      sy: scy,
      tx: rightwards ? target.x : target.x + target.width,
      ty: tcy,
      sourcePos: rightwards ? Position.Right : Position.Left,
      targetPos: rightwards ? Position.Left : Position.Right,
    };
  }
  const downwards = tcy > scy;
  return {
    sx: scx,
    sy: downwards ? source.y + source.height : source.y,
    tx: tcx,
    ty: downwards ? target.y : target.y + target.height,
    sourcePos: downwards ? Position.Bottom : Position.Top,
    targetPos: downwards ? Position.Top : Position.Bottom,
  };
}

/** PURE: compute the floating-edge endpoints between a source and target node box. */
export function getEdgeParams(source: NodeBox, target: NodeBox): EdgeParams {
  const s = getNodeIntersection(source, target);
  const t = getNodeIntersection(target, source);
  return {
    sx: s.x,
    sy: s.y,
    tx: t.x,
    ty: t.y,
    sourcePos: getEdgePosition(source, s),
    targetPos: getEdgePosition(target, t),
  };
}

/**
 * Half the gap between two neighbouring lanes — the offset each edge of a plain pair takes.
 *
 * Without it every edge joining the same two nodes renders on the SAME line: `getEdgeParams(B,A)`
 * reuses the very same intersection points as `getEdgeParams(A,B)`, and two transitions sharing one
 * direction are literally the same call, so the paths coincide and the action labels land on
 * identical coordinates, leaving only whichever painted last readable.
 */
export const RECIPROCAL_LANE = 16;

/** Distance between neighbouring lanes; a pair straddles the centre line at ±`RECIPROCAL_LANE`. */
export const LANE_STEP = 2 * RECIPROCAL_LANE;

/**
 * How far beyond its own lane a label sits, picked from the axis the two labels separate along.
 *
 * They stack vertically when the pair is side by side, but sit side by side when the pair is
 * stacked — and there a label box is up to 140px wide and a chip 150px, so the vertical figure would
 * let them overlap again. Which is exactly what a vertical arrangement produces, so one constant
 * cannot serve both.
 *
 * Two labels of a pair end up `2 * RECIPROCAL_LANE + 2 * extra` apart: their paths are already one
 * lane either side of centre, and each label steps `extra` further out from ITS OWN path.
 *
 * Stacked must clear a FULL label column — action 26 + role chip 22 + guard chip 22 + the two 2px
 * gaps between = 74px. `2*16 + 2*24 = 80` clears that by 6px, which is what the demo workflow's
 * guarded `start_work` pair gets once arranged horizontally — thin enough that the pair still read
 * as one blob to a reviewer. `2*16 + 2*32 = 96` leaves 22px. Re-measured with 32: labels landing on
 * a node stayed at 1 of 17 across every layout direction, so the extra room costs nothing.
 */
export const LABEL_EXTRA_STACKED = 32;
export const LABEL_EXTRA_SIDEWAYS = 80;

/** The shape `edgeLane` needs off an edge — accepts a `FlowEdge` or any bare `{id,source,target}`. */
interface EdgeEnds {
  id: string;
  source: string;
  target: string;
}

/**
 * PURE. The lane this edge takes among every edge joining the same two nodes, in either direction:
 * `0` when it is the only one, otherwise a slot spreading the group evenly about the centre line.
 *
 * Two shapes collide today and both are ordinary in a real workflow — `A→B` alongside `B→A`, and two
 * transitions sharing one `from→to` because they carry different guards.
 *
 * The id comparison in the last step picks a CANONICAL direction for the pair; it does not add a
 * flip, it undoes one. The perpendicular is taken from the edge's OWN axis and `B→A`'s axis is the
 * negation of `A→B`'s, so an edge running against the canonical direction would otherwise land its
 * slot on the wrong side. Drop that step and a reciprocal pair collapses back onto one line —
 * separating nothing, which is precisely the bug this exists to fix.
 */
export function edgeLane(
  edges: readonly EdgeEnds[],
  id: string,
  source: string,
  target: string,
): number {
  // A self-loop is its own reverse; offsetting it would just move a shape that is already degenerate.
  if (source === target) return 0;
  const group = edges
    .filter(
      (e) =>
        (e.source === source && e.target === target) ||
        (e.source === target && e.target === source),
    )
    // Sorted so the slots survive a re-render: the store hands edges back in creation order, which
    // changes whenever one is deleted and redrawn.
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (group.length <= 1) return 0;

  const index = group.findIndex((e) => e.id === id);
  // `id` comes off the rendered edge and `edges` off the store; they can disagree for a frame while
  // an edge is being replaced. `findIndex` would answer -1, and -1 is a perfectly finite slot — a
  // silently wrong lane rather than a visible failure.
  if (index < 0) return 0;

  const slot = (index - (group.length - 1) / 2) * LANE_STEP;
  return source > target ? -slot : slot;
}

/** Keep a point inside the node it is supposed to be attached to. */
function clampToBox(x: number, y: number, box: NodeBox): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, box.x), box.x + box.width),
    y: Math.min(Math.max(y, box.y), box.y + box.height),
  };
}

/** The unit normal of the source→target axis, or `null` when the two points coincide. */
function unitNormal(p: EdgeParams): { nx: number; ny: number } | null {
  const dx = p.tx - p.sx;
  const dy = p.ty - p.sy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  return { nx: -dy / len, ny: dx / len };
}

/**
 * PURE. Move both endpoints `distance` along the edge's own normal so the edges joining one pair of
 * nodes run as parallel lanes, clamped back into the node boxes — a 16px step can otherwise push the
 * anchor past a corner, leaving the arrow to begin in empty space while `sourcePos` still claims a
 * side.
 *
 * Returns `p` untouched for `distance === 0` (the ordinary one-way edge must not move by a pixel)
 * and for two nodes sharing a centre, where the normal is undefined and dividing by zero would put
 * `NaN` in the path — dragging one node fully onto another is enough to hit that.
 */
export function offsetAlongNormal(
  p: EdgeParams,
  distance: number,
  sourceBox: NodeBox,
  targetBox: NodeBox,
): EdgeParams {
  if (distance === 0) return p;
  const n = unitNormal(p);
  if (!n) return p;
  const s = clampToBox(p.sx + n.nx * distance, p.sy + n.ny * distance, sourceBox);
  const t = clampToBox(p.tx + n.nx * distance, p.ty + n.ny * distance, targetBox);
  return { ...p, sx: s.x, sy: s.y, tx: t.x, ty: t.y };
}

/**
 * PURE. How far to push the label off ITS OWN path's midpoint, so it reads as belonging to its own
 * arrow and clears the neighbouring label. `{0,0}` for an edge with no lane.
 *
 * Deliberately does NOT re-add `lane`: the midpoint this is applied to already comes from the laned
 * path, so counting the lane again both doubles the clearance and drags the label away from the
 * arrow it labels (measured: 96px away sideways).
 */
export function labelOffsetFor(p: EdgeParams, lane: number): { dx: number; dy: number } {
  if (lane === 0) return { dx: 0, dy: 0 };
  const n = unitNormal(p);
  if (!n) return { dx: 0, dy: 0 };
  // A horizontal normal means the two labels end up side by side, where WIDTH is what has to clear.
  const extra = Math.abs(n.nx) > Math.abs(n.ny) ? LABEL_EXTRA_SIDEWAYS : LABEL_EXTRA_STACKED;
  const d = Math.sign(lane) * extra;
  return { dx: n.nx * d, dy: n.ny * d };
}

/**
 * PURE. The whole chain an edge is drawn from: pick the anchors, lane the endpoints, route the
 * path, then place the label off that path.
 *
 * It exists as one function because the steps only mean anything TOGETHER. Testing them apart left
 * the composition ungated — dropping the label shift entirely kept every unit test green while
 * putting two labels 32px apart against a 74px label column, which is the bug this all exists to fix.
 *
 * Choosing the anchors HERE rather than at the call site is deliberate: it used to take a ready-made
 * `base`, which left the choice in the component where no test could reach it. Now a pure test
 * covers it, and the component only supplies the lane and the two boxes.
 *
 * 🔴 One link is still ungated: nothing tests that the COMPONENT feeds this the store's lane.
 * Hardcoding `lane` to 0 at the call site below keeps the whole suite green. A jsdom render was
 * attempted and abandoned — xyflow reaches `nodesInitialized: true` with correct `measured` sizes
 * and still emits no edge elements without a live ResizeObserver. So that one line is covered by
 * live smoke only: on the demo workflow the reciprocal pair measured x=144/x=176 against x=160 for
 * the one-way edge beside it. Re-measure it by hand when you touch the call site.
 */
export function edgeGeometry(
  lane: number,
  sourceBox: NodeBox,
  targetBox: NodeBox,
): { path: string; labelX: number; labelY: number } {
  // Axis-aligned anchors wherever the boxes have facing sides; the free-floating border
  // intersection only for boxes overlapping on both axes (dragged onto each other), where no pair
  // of sides faces the other node.
  const base = axisEdgeParams(sourceBox, targetBox) ?? getEdgeParams(sourceBox, targetBox);
  const { sx, sy, tx, ty, sourcePos, targetPos } = offsetAlongNormal(
    base,
    lane,
    sourceBox,
    targetBox,
  );
  const [path, midX, midY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 8,
  });
  const shift = labelOffsetFor(base, lane);
  return { path, labelX: midX + shift.dx, labelY: midY + shift.dy };
}

function boxOf(node: InternalNode<Node>): NodeBox {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
  };
}

/** A role/guard chip shown beneath the action label so the branch's "who" and "when" read straight
 *  off the canvas (#2). Presentation only — the engine still evaluates the raw role/guard. */
function EdgeChip({
  icon,
  text,
  title,
  tone,
}: {
  icon: ReactNode;
  text: string;
  title?: string;
  tone: "role" | "guard";
}) {
  const palette =
    tone === "guard"
      ? { background: "#fffbe6", border: "#ffe58f", color: "#ad6800" }
      : { background: "#f5f5f5", border: "#e8e8e8", color: "rgba(0,0,0,0.6)" };
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        maxWidth: 150,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 500,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: palette.color,
      }}
    >
      <span style={{ fontSize: 9, display: "inline-flex" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </span>
  );
}

/** Custom edge that routes to the nearest borders and renders its action as a centered label. */
export function FloatingEdge({
  id,
  source,
  target,
  markerEnd,
  style,
  label,
  selected,
  data,
}: EdgeProps) {
  const { edgeIds } = useContext(PathHighlightContext);
  const onPath = edgeIds?.has(id) ?? false;
  const dimmed = edgeIds != null && !onPath;
  const emphasized = selected || onPath;

  const strokeColor = emphasized
    ? "#1677ff"
    : ((style?.stroke as string | undefined) ?? EDGE_STROKE);
  // Width stays constant — only colour/opacity change on path highlight (user UX request).
  const strokeWidth = (style?.strokeWidth as number | undefined) ?? EDGE_STROKE_WIDTH;

  // Motion is a signal, not a default: normal edges render static & solid; only the highlighted
  // upstream path / selected edge flows, so movement means "this is the branch you're looking at".
  const pathClass = emphasized ? "workflow-edge-flow workflow-edge-flow--active" : undefined;

  const pathStyle = {
    ...style,
    stroke: strokeColor,
    strokeWidth,
    ...(dimmed ? { opacity: 0.22 } : {}),
  };

  const edgeData = data as FlowEdgeData | undefined;
  const role = edgeData?.role;
  const guard = edgeData?.guard;
  const hasMeta = Boolean(label || role || guard);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // Read live rather than off `data`: transitions are also drawn interactively (`onConnect`), so a
  // slot baked in at `toFlow` time would be stale the moment someone adds another edge between the
  // same two nodes. The selector yields a number, so it compares by value and cannot loop. MUST stay
  // above the early return below — a hook behind a conditional changes the hook count between renders.
  const lane = useStore((s) => edgeLane(s.edges, id, source, target));
  if (!sourceNode || !targetNode) return null;

  const sourceBox = boxOf(sourceNode);
  const targetBox = boxOf(targetNode);
  const { path, labelX, labelY } = edgeGeometry(lane, sourceBox, targetBox);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={pathStyle} className={pathClass} />
      {hasMeta ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              opacity: dimmed ? 0.35 : 1,
            }}
          >
            {label ? (
              <div
                style={{
                  maxWidth: 140,
                  padding: "3px 9px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: 1.35,
                  letterSpacing: "0.01em",
                  textAlign: "center",
                  background: emphasized ? "#e6f4ff" : "#fff",
                  border: `1px solid ${emphasized ? "#91caff" : "#e8e8e8"}`,
                  color: emphasized ? "#0958d9" : "rgba(0,0,0,0.72)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                {label}
              </div>
            ) : null}
            {role ? (
              <EdgeChip
                tone="role"
                icon={<UserOutlined />}
                text={role}
                title={`Vai trò: ${role}`}
              />
            ) : null}
            {guard ? (
              <EdgeChip
                tone="guard"
                icon={<FilterOutlined />}
                text={shortGuard(guard)}
                title={`Điều kiện: ${summarizeGuard(guard)}`}
              />
            ) : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const workflowEdgeTypes = { floating: FloatingEdge };
