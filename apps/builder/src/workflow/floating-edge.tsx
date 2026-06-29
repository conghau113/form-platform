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
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    boxOf(sourceNode),
    boxOf(targetNode),
  );
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    borderRadius: 8,
  });

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
