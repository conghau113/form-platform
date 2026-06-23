import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  type InternalNode,
  type Node,
  Position,
  useInternalNode,
} from "@xyflow/react";

/**
 * Floating edges: a transition attaches to the nearest border of each state node instead of a
 * fixed Left/Right handle, so the graph reads cleanly no matter which way the user lays it out.
 * The geometry (`getEdgeParams`) is a PURE function of two node boxes — unit-tested, no React —
 * while {@link FloatingEdge} only adapts xyflow's `InternalNode` into those boxes. Nothing here
 * touches the workflow contract: edges still persist by `source`/`target` node id only.
 */

/** A node's absolute box in flow coordinates (top-left origin + size), the input geometry needs. */
export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The point where the center-to-center line crosses `node`'s border (ellipse approximation). */
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

/** Which border of `node` the intersection point sits on → the handle position for the bezier. */
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

/** Endpoints + sides for a floating edge between two node boxes. */
export interface EdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
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

function boxOf(node: InternalNode<Node>): NodeBox {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
  };
}

/** Custom edge that routes to the nearest borders and renders its action as a centered label. */
export function FloatingEdge({ id, source, target, markerEnd, style, label, selected }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    boxOf(sourceNode),
    boxOf(targetNode),
  );
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              padding: "1px 6px",
              borderRadius: 4,
              fontSize: 12,
              background: "#fff",
              border: `1px solid ${selected ? "#1677ff" : "#d9d9d9"}`,
              color: "rgba(0,0,0,0.85)",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
