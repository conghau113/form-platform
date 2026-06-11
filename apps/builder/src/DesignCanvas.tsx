import { CopyOutlined, DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import { FormRenderer } from "@org/form-renderer-web";
import { childrenOf, type FieldNode } from "@org/form-schema";
import type { ThemeConfig } from "antd";
import {
  Component,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { TreeNode } from "./engine/tree";
import { describeNode } from "./field-registry";
import type { DragState } from "./useDragon";

const BLUE = "#1677ff";
const RED = "#ff4d4f";

/* ----------------------------------------------------------------------------
 * DesignCanvas — the WYSIWYG editor surface. It renders the real `FormRenderer`
 * in design mode and wraps every authorable node in a `NodeShell` that draws the
 * Designable-style aux widgets: hover outline + name tag, selection box with a
 * floating toolbar (drag handle / copy / delete), the live insertion line during
 * a drag, and a "+" placeholder inside empty droppable containers.
 * ------------------------------------------------------------------------- */

/** App-provided designer state + handlers (selection, drag engine, node ops). */
export interface DesignerValue {
  selected: string[];
  drag: DragState | null;
  beginMove: (uids: string[], e: React.PointerEvent, clickUid?: string) => void;
  beginCreate: (type: import("./field-registry").FieldType, e: React.PointerEvent) => void;
  copy: (uid: string) => void;
  remove: (uid: string) => void;
  clearSelection: () => void;
}

const DesignerContext = createContext<DesignerValue | null>(null);
export const DesignerProvider = DesignerContext.Provider;
export function useDesigner(): DesignerValue {
  const v = useContext(DesignerContext);
  if (!v) throw new Error("useDesigner must be used inside a DesignerProvider");
  return v;
}

// Hover lives here (not in App) so moving the pointer only re-renders NodeShells —
// the memoised FormRenderer element below never rebuilds on hover.
const HoverContext = createContext<{
  hovered: string | null;
  setHovered: (uid: string | null) => void;
}>({ hovered: null, setHovered: () => {} });

function nodeLabel(node: FieldNode): string {
  if ("label" in node && node.label) return node.label;
  if ("title" in node && node.title) return node.title;
  if ("name" in node && node.name) return node.name;
  return node.type;
}

/** A blue/red bar at the target's leading or trailing edge, oriented by the parent axis. */
function InsertionLine({
  side,
  axis,
  valid,
}: {
  side: "before" | "after";
  axis: DragState["axis"];
  valid: boolean;
}) {
  const color = valid ? BLUE : RED;
  const base: React.CSSProperties = {
    position: "absolute",
    background: color,
    pointerEvents: "none",
    zIndex: 3,
  };
  const style: React.CSSProperties =
    axis === "vertical"
      ? { ...base, left: 0, right: 0, height: 3, [side === "before" ? "top" : "bottom"]: -2 }
      : { ...base, top: 0, bottom: 0, width: 3, [side === "before" ? "left" : "right"]: -2 };
  return <div style={style} />;
}

/** The selection/hover wrapper drawn around one rendered node. */
function NodeShell({ uid, node, children }: { uid: string; node: FieldNode; children: ReactNode }) {
  const d = useDesigner();
  const { hovered, setHovered } = useContext(HoverContext);
  const selected = d.selected.includes(uid);
  const isHovered = hovered === uid && !selected;
  const dropHere = d.drag?.intent && d.drag.intent.uid === uid ? d.drag : null;
  const meta = describeNode(node.type);
  const empty = meta.behavior.droppable && (childrenOf(node)?.length ?? 0) === 0;

  // Pressing a member of a multi-selection drags the whole selection; otherwise just
  // this node. Either way a non-drag click selects THIS node (passed as the clickUid).
  const dragSet = selected && d.selected.length > 1 ? d.selected : [uid];
  const startMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    d.beginMove(dragSet, e, uid);
  };

  const outline = selected
    ? `2px solid ${BLUE}`
    : isHovered
      ? `1px dashed ${BLUE}`
      : dropHere?.intent?.kind === "inner"
        ? `2px dashed ${dropHere.valid ? BLUE : RED}`
        : undefined;

  return (
    <div
      data-designer-node-id={uid}
      onPointerDown={startMove}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(uid);
      }}
      style={{
        position: "relative",
        outline,
        outlineOffset: 1,
        borderRadius: 2,
        minHeight: empty ? 48 : undefined,
      }}
    >
      {isHovered && (
        <span
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: "translateY(-100%)",
            background: BLUE,
            color: "#fff",
            fontSize: 11,
            lineHeight: "16px",
            padding: "0 6px",
            borderRadius: "2px 2px 0 0",
            pointerEvents: "none",
            zIndex: 4,
            whiteSpace: "nowrap",
          }}
        >
          {nodeLabel(node)}
        </span>
      )}

      {selected && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            transform: "translateY(-100%)",
            display: "flex",
            alignItems: "center",
            gap: 2,
            background: BLUE,
            color: "#fff",
            borderRadius: "2px 2px 0 0",
            padding: "0 2px",
            zIndex: 5,
          }}
          // Toolbar clicks must not bubble into a shell drag/select.
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span style={{ fontSize: 11, padding: "0 4px", whiteSpace: "nowrap" }}>
            {nodeLabel(node)}
          </span>
          <ToolbarButton title="Drag" onPointerDown={startMove}>
            <HolderOutlined />
          </ToolbarButton>
          {meta.behavior.cloneable && (
            <ToolbarButton title="Copy" onClick={() => d.copy(uid)}>
              <CopyOutlined />
            </ToolbarButton>
          )}
          {meta.behavior.deletable && (
            <ToolbarButton title="Delete" onClick={() => d.remove(uid)}>
              <DeleteOutlined />
            </ToolbarButton>
          )}
        </div>
      )}

      {dropHere?.intent && dropHere.intent.kind !== "inner" && (
        <InsertionLine side={dropHere.intent.kind} axis={dropHere.axis} valid={dropHere.valid} />
      )}

      {children}

      {empty && (
        <div
          style={{
            position: "absolute",
            inset: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(0,0,0,0.25)",
            border: "1px dashed rgba(0,0,0,0.15)",
            borderRadius: 4,
            fontSize: 20,
            pointerEvents: "none",
          }}
        >
          +
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  title,
  onClick,
  onPointerDown,
  children,
}: {
  title: string;
  onClick?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      style={{
        border: "none",
        background: "transparent",
        color: "#fff",
        cursor: "pointer",
        fontSize: 12,
        lineHeight: "18px",
        padding: "0 3px",
      }}
    >
      {children}
    </button>
  );
}

/** Catches a transiently-invalid model (e.g. a name cleared mid-edit) so the canvas
 *  shows a message instead of crashing; remounts (via `key`) once the model is valid. */
class CanvasBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: RED }}>Invalid schema: {this.state.error.message}</div>
      );
    }
    return this.props.children;
  }
}

/** Walk the tree assigning each node its positional path key ("i-j-k") → uid, the
 *  same route `FormRenderer`'s `nodeWrapper` reports, so a shell can recover its uid. */
function buildPathIndex(root: TreeNode): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (node: TreeNode, path: number[]) => {
    node.children.forEach((child, i) => {
      const p = [...path, i];
      map.set(p.join("-"), child.uid);
      walk(child, p);
    });
  };
  walk(root, []);
  return map;
}

const LEGEND = "Drag a field from the palette · Click to select · Copy ⌘/Ctrl+C/V · Delete";

export function DesignCanvas({
  schema,
  json,
  tree,
  theme,
}: {
  schema: unknown;
  /** Stable string key for the schema — resets the error boundary on a valid edit. */
  json: string;
  tree: TreeNode;
  theme?: ThemeConfig;
}) {
  const d = useDesigner();
  const [hovered, setHovered] = useState<string | null>(null);
  const uidByPath = useMemo(() => buildPathIndex(tree), [tree]);
  const isEmpty = tree.children.length === 0;

  const wrapper = useCallback(
    (rendered: ReactNode, ctx: { node: FieldNode; path: number[] }) => {
      const uid = uidByPath.get(ctx.path.join("-"));
      if (!uid) return rendered;
      return (
        <NodeShell uid={uid} node={ctx.node}>
          {rendered}
        </NodeShell>
      );
    },
    [uidByPath],
  );

  // The rendered form is memoised on the schema/theme only, so hover/selection (which
  // flow through context) re-render the NodeShells without rebuilding the form tree.
  const formEl = useMemo(
    () => (
      <CanvasBoundary key={json}>
        <FormRenderer
          schema={schema}
          theme={theme}
          designMode
          access={{ roles: ["admin"] }}
          nodeWrapper={wrapper}
        />
      </CanvasBoundary>
    ),
    [schema, json, theme, wrapper],
  );

  return (
    <HoverContext.Provider value={{ hovered, setHovered }}>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 24,
          background: "#f5f5f5",
          position: "relative",
        }}
        // A press on empty canvas (shells stop propagation) clears the selection.
        onPointerDown={() => d.clearSelection()}
        onPointerLeave={() => setHovered(null)}
      >
        <div
          style={{
            maxWidth: 820,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 8,
            padding: 24,
            minHeight: 200,
          }}
        >
          {isEmpty ? (
            <div style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", padding: "64px 0" }}>
              {LEGEND}
            </div>
          ) : (
            formEl
          )}
        </div>
      </div>

      {d.drag && (
        <div
          style={{
            position: "fixed",
            left: d.drag.point.x + 12,
            top: d.drag.point.y + 12,
            padding: "2px 8px",
            background: d.drag.valid ? BLUE : "rgba(0,0,0,0.65)",
            color: "#fff",
            fontSize: 12,
            borderRadius: 4,
            pointerEvents: "none",
            zIndex: 1000,
          }}
        >
          {d.drag.label}
        </div>
      )}
    </HoverContext.Provider>
  );
}
