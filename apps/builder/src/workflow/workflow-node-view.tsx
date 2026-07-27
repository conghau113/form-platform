import { FileOutlined, PlayCircleOutlined } from "@ant-design/icons";
import type { StatusCatalogEntry } from "@org/workflow-schema";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { Input, Tag, Typography } from "antd";
import { createContext, memo, useContext } from "react";
import { KIND_LABEL, resolveStatusStyle } from "./status-catalog";
import type { FlowNode } from "./workflow-model";
import "./workflow-canvas.css";

/** Context for inline rename, catalog resolution, path highlight, and form titles. */
export interface NodeViewCtx {
  renamingNodeId: string | null;
  commitRename: (id: string, status: string) => void;
  cancelRename: () => void;
  byCode: ReadonlyMap<string, StatusCatalogEntry>;
  /** formId → title for readable subtitles on the canvas. */
  formTitles: ReadonlyMap<string, string>;
  /** Upstream path highlight: nodes outside this set render dimmed (presentation only). */
  highlightNodeIds: ReadonlySet<string> | null;
  /** Validator / linter issue rings — rendered on the card, not the xyflow wrapper. */
  errorNodeIds: ReadonlySet<string>;
  warnNodeIds: ReadonlySet<string>;
}

export const NodeViewContext = createContext<NodeViewCtx>({
  renamingNodeId: null,
  commitRename: () => {},
  cancelRename: () => {},
  byCode: new Map(),
  formTitles: new Map(),
  highlightNodeIds: null,
  errorNodeIds: new Set(),
  warnNodeIds: new Set(),
});

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  background: "#1677ff",
  border: "2px solid #fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
} as const;

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

/** Tint a hex colour for a soft header wash (presentation only). */
function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(140, 140, 140, ${alpha})`;
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Custom workflow state node — status colour, bound form, start badge, connect handles. */
export const WorkflowNodeView = memo(function WorkflowNodeView({
  id,
  data,
  selected,
}: NodeProps<FlowNode>) {
  const ctx = useContext(NodeViewContext);
  const renaming = ctx.renamingNodeId === id;
  const dimmed = ctx.highlightNodeIds != null && !ctx.highlightNodeIds.has(id);
  const resolved = resolveStatusStyle(data, ctx.byCode);
  const formTitle = data.formId ? ctx.formTitles.get(data.formId) : undefined;
  const isError = ctx.errorNodeIds.has(id);
  const isWarn = !isError && ctx.warnNodeIds.has(id);

  const className = [
    "workflow-node",
    isError ? "workflow-node--issue-error" : isWarn ? "workflow-node--issue-warn" : "",
    !isError && !isWarn && selected ? "workflow-node--selected" : "",
    dimmed ? "workflow-node--dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        minWidth: 168,
        maxWidth: 240,
        borderRadius: 8,
        border: "1px solid #ebebeb",
        background: "#fff",
      }}
    >
      {/* Status accent — separate layer so selection ring never hides it. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          background: resolved.color,
          pointerEvents: "none",
        }}
      />
      {/* Soft colour wash ties the card to its status without overwhelming content. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${tint(resolved.color, 0.1)} 0%, transparent 55%)`,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", padding: "10px 14px 10px 16px" }}>
        {SIDES.map((pos) => (
          <Handle key={pos} id={pos} type="source" position={pos} style={HANDLE_STYLE} />
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: resolved.color,
              boxShadow: `0 0 0 2px ${tint(resolved.color, 0.25)}`,
            }}
          />
          {renaming ? (
            <Input
              className="nodrag"
              size="small"
              autoFocus
              defaultValue={data.status}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => ctx.commitRename(id, e.target.value)}
              onPressEnter={(e) => ctx.commitRename(id, (e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") ctx.cancelRename();
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
          ) : (
            <Typography.Text
              strong
              ellipsis
              style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.35 }}
            >
              {resolved.label || "(chưa đặt tên)"}
            </Typography.Text>
          )}
          {resolved.missing && (
            <Tag color="orange" style={{ margin: 0, fontSize: 11, lineHeight: "18px" }}>
              ?
            </Tag>
          )}
          {data.isStart && (
            <Tag
              icon={<PlayCircleOutlined />}
              color="success"
              style={{ margin: 0, fontSize: 11, lineHeight: "18px" }}
            >
              Bắt đầu
            </Tag>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingLeft: 16,
          }}
        >
          <FileOutlined style={{ fontSize: 11, color: data.formId ? "#8c8c8c" : "#bfbfbf" }} />
          <Typography.Text
            type="secondary"
            ellipsis
            style={{
              fontSize: 11,
              lineHeight: 1.4,
              color: data.formId ? "rgba(0,0,0,0.45)" : "#bfbfbf",
              fontStyle: data.formId ? "normal" : "italic",
            }}
          >
            {data.formId ? (formTitle ?? data.formId) : "Chưa gắn form"}
          </Typography.Text>
        </div>

        {!data.statusCode && data.kind && (
          <Typography.Text
            type="secondary"
            style={{
              display: "block",
              marginTop: 4,
              paddingLeft: 16,
              fontSize: 10,
              color: "rgba(0,0,0,0.35)",
            }}
          >
            {KIND_LABEL[data.kind]}
          </Typography.Text>
        )}
      </div>
    </div>
  );
});

export const workflowNodeTypes = { workflow: WorkflowNodeView };
