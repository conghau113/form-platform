import { CopyOutlined, DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import { FormRenderer } from "@org/form-renderer-web";
import { childrenOf, type FieldNode, isLayoutContainer } from "@org/form-schema";
import type { ThemeConfig } from "antd";
import {
  Component,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TreeNode } from "./engine/tree";
import { describeNode } from "./field-registry";
import type { ColKey } from "./PropertyPanel/types";
import type { DragState } from "./useDragon";
import { useHover } from "./workbench/hover";

const BLUE = "#1677ff";
const RED = "#ff4d4f";

/** antd's responsive Col keys off the WINDOW width (media queries), not the canvas
 *  device simulator, so the breakpoint a drag actually changes is the one matching
 *  the browser. xl/xxl fold to `lg` (the largest key the contract carries). */
function activeColKey(width: number): ColKey {
  if (width >= 992) return "lg";
  if (width >= 768) return "md";
  if (width >= 576) return "sm";
  return "xs";
}

/** Grid divisions across one antd Row. */
const GRID_COLS = 24;

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
  /** Select a single node (Outline tree / breadcrumb); `additive` toggles it in a
   *  multi-selection. */
  select: (uid: string, additive?: boolean) => void;
  /** A press on empty canvas: the host decides (App selects the Form root). */
  clearSelection: () => void;
  /** Drag-resize a leaf's responsive width: write `layout.colSpan[key]` (1..24)
   *  for the active breakpoint. `gesture` ties one continuous drag to a single
   *  undo step (see `useHistory`'s coalesce). */
  resizeColSpan: (uid: string, key: ColKey, span: number, gesture: string) => void;
}

const DesignerContext = createContext<DesignerValue | null>(null);
export const DesignerProvider = DesignerContext.Provider;
export function useDesigner(): DesignerValue {
  const v = useContext(DesignerContext);
  if (!v) throw new Error("useDesigner must be used inside a DesignerProvider");
  return v;
}

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
  return <div className="designer-aux" style={style} />;
}

/** The selection/hover wrapper drawn around one rendered node. */
function NodeShell({ uid, node, children }: { uid: string; node: FieldNode; children: ReactNode }) {
  const d = useDesigner();
  const { hovered, setHovered } = useHover();
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

  // Grid resize (D8): only leaf fields honor `layout.colSpan` (containers/arrays
  // render their own span), and only when antd actually wrapped this node in a Col
  // (a Space/table cell renders it bare — nothing to resize there).
  const shellRef = useRef<HTMLDivElement>(null);
  const resizable = !isLayoutContainer(node) && node.type !== "array";
  const [inCol, setInCol] = useState(false);
  // No dep array: re-check the DOM parent every render (cheap; the parent can change
  // as the node moves between a grid Col and a bare Space/table cell).
  useLayoutEffect(() => {
    setInCol(shellRef.current?.parentElement?.classList.contains("ant-col") ?? false);
  });
  const [resize, setResize] = useState<{ span: number; key: ColKey } | null>(null);
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Select the node so its handle stays visible for the whole drag (hover alone can
    // shift to a neighbour as the pointer nears the column edge).
    if (!selected) d.select(uid);
    const col = shellRef.current?.parentElement;
    const row = col?.closest(".ant-row");
    if (!col || !row) return;
    const unit = row.getBoundingClientRect().width / GRID_COLS;
    if (unit <= 0) return;
    const startWidth = col.getBoundingClientRect().width;
    const startX = e.clientX;
    const key = activeColKey(window.innerWidth);
    const gesture = String(Date.now());
    const spanAt = (w: number) => Math.min(GRID_COLS, Math.max(1, Math.round(w / unit)));
    let last = spanAt(startWidth);
    setResize({ span: last, key });
    const onMove = (ev: PointerEvent) => {
      const span = spanAt(startWidth + (ev.clientX - startX));
      setResize({ span, key });
      if (span !== last) {
        last = span;
        d.resizeColSpan(uid, key, span, gesture);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setResize(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const showHandle = resizable && inCol && (selected || isHovered || !!resize);

  const outline = selected
    ? `2px solid ${BLUE}`
    : isHovered
      ? `1px dashed ${BLUE}`
      : dropHere?.intent?.kind === "inner"
        ? `2px dashed ${dropHere.valid ? BLUE : RED}`
        : undefined;

  return (
    <div
      ref={shellRef}
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
          className="designer-aux"
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
          className="designer-aux"
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

      {showHandle && (
        // A wide grab zone centred on the column boundary, reaching ~14px INWARD so it
        // also covers a widget's right-side affordance (a Select/TreeSelect/Cascader
        // dropdown arrow, a DatePicker icon) — otherwise users aiming at that arrow miss
        // the handle and start a node-move drag instead. High z-index keeps it above the
        // (pointer-inert) control. A slim blue bar marks the boundary.
        <div
          className="designer-aux"
          title="Drag to resize column"
          onPointerDown={startResize}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: -10,
            width: 24,
            cursor: "col-resize",
            zIndex: 10,
            touchAction: "none",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 4,
              alignSelf: "stretch",
              background: BLUE,
              opacity: resize ? 0.95 : 0.55,
              borderRadius: 2,
            }}
          />
        </div>
      )}

      {resize && (
        <span
          className="designer-aux"
          style={{
            position: "absolute",
            top: "50%",
            right: 10,
            transform: "translateY(-50%)",
            background: BLUE,
            color: "#fff",
            fontSize: 11,
            lineHeight: "16px",
            padding: "0 6px",
            borderRadius: 2,
            pointerEvents: "none",
            zIndex: 6,
            whiteSpace: "nowrap",
          }}
        >
          {resize.span} / {GRID_COLS} · {resize.key}
        </span>
      )}

      {children}

      {empty && (
        <div
          className="designer-aux"
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

/** Mounts the captured ghost clone (a live DOM node) into the floating preview without
 *  `dangerouslySetInnerHTML`. Re-appends only when the node identity changes (once per
 *  drag), so the per-pointer-move position updates on the parent don't re-mount it. */
function GhostHost({ node, width }: { node: HTMLElement; width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(node);
    return () => host.replaceChildren();
  }, [node]);
  // The clone keeps its own width; constrain the host so a wide node stays a tidy card.
  return <div ref={ref} style={{ width, overflow: "hidden" }} />;
}

/** Catches a transiently-invalid model (e.g. a name cleared mid-edit) so the canvas
 *  shows a message instead of crashing. A fresh edit (new `json`) clears the error via
 *  derived state — NOT a remount: remounting the whole form on every edit dropped input
 *  focus and aborted in-flight gestures (notably the D8 column drag-resize, which commits
 *  many times per drag). */
class CanvasBoundary extends Component<
  { json: string; children: ReactNode },
  { error: Error | null; seenJson: string }
> {
  state = { error: null as Error | null, seenJson: this.props.json };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(
    props: { json: string },
    state: { error: Error | null; seenJson: string },
  ) {
    if (props.json !== state.seenJson) return { error: null, seenJson: props.json };
    return null;
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
  maxWidth = 820,
}: {
  schema: unknown;
  /** Stable string key for the schema — resets the error boundary on a valid edit. */
  json: string;
  tree: TreeNode;
  theme?: ThemeConfig;
  /** Canvas content width — driven by the toolbar device simulator (F2). */
  maxWidth?: number;
}) {
  const d = useDesigner();
  const { setHovered } = useHover();
  const uidByPath = useMemo(() => buildPathIndex(tree), [tree]);
  const isEmpty = tree.children.length === 0;
  // The form card lights up when a drag targets the root itself (append into form).
  const rootDrop = d.drag?.intent?.uid === tree.uid ? d.drag : null;

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
      <CanvasBoundary json={json}>
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
    <>
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 24,
          background: "#f5f5f5",
          position: "relative",
        }}
        // A press on empty canvas (shells stop propagation) selects the Form root.
        onPointerDown={() => d.clearSelection()}
        onPointerLeave={() => setHovered(null)}
      >
        <div
          // The form card carries the ROOT uid so the form itself is always a drop
          // target: hovering an empty card (or the gap below the last field) resolves
          // here, while `closest` still prefers a nested child shell when over one.
          // Without this an emptied form has no `[data-designer-node-id]` to hit-test,
          // so nothing could be dropped back in.
          data-designer-node-id={tree.uid}
          style={{
            maxWidth,
            margin: "0 auto",
            background: "#fff",
            borderRadius: 8,
            padding: 24,
            minHeight: 200,
            outline: rootDrop ? `2px dashed ${rootDrop.valid ? BLUE : RED}` : undefined,
            outlineOffset: -2,
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

      {d.drag &&
        (d.drag.ghost ? (
          // Real drag ghost (D5): a faded clone of the node, tagged with a small chip
          // (label + copy hint), bordered by validity. Palette creates have no on-canvas
          // node yet, so they fall back to the text label below.
          <div
            style={{
              position: "fixed",
              left: d.drag.point.x + 12,
              top: d.drag.point.y + 12,
              maxHeight: 220,
              overflow: "hidden",
              padding: 8,
              background: "#fff",
              border: `1px solid ${d.drag.valid ? BLUE : RED}`,
              borderRadius: 4,
              boxShadow: "0 6px 16px rgba(0,0,0,0.18)",
              opacity: 0.85,
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            <span
              style={{
                display: "inline-block",
                marginBottom: 6,
                padding: "0 6px",
                background: d.drag.valid ? BLUE : RED,
                color: "#fff",
                fontSize: 11,
                lineHeight: "16px",
                borderRadius: 2,
                whiteSpace: "nowrap",
              }}
            >
              {d.drag.copy ? `+ ${d.drag.label} (copy)` : d.drag.label}
            </span>
            <GhostHost node={d.drag.ghost.node} width={d.drag.ghost.width} />
          </div>
        ) : (
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
            {d.drag.copy ? `+ ${d.drag.label} (copy)` : d.drag.label}
          </div>
        ))}
    </>
  );
}
