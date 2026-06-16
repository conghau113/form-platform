import { CopyOutlined, DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import type { PresetResolver } from "@org/form-core";
import { FormRenderer } from "@org/form-renderer-web";
import { childrenOf, type FieldNode, isLayoutContainer } from "@org/form-schema";
import type { ThemeConfig } from "antd";
import {
  Component,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type TreeNode, topMostUids } from "./engine/tree";
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

/** Auto-scroll (D3): how close (px) to a scroll-container edge the pointer must get before
 *  the canvas starts scrolling, and the max px/frame at the very edge. */
const EDGE_BAND = 56;
const EDGE_MAX_SPEED = 20;

/** Pure edge-scroll math: given the pointer and the scroll viewport rect, return the
 *  per-frame scroll delta. Speed ramps linearly from 0 at the band's inner edge to
 *  `max` at the viewport edge (and clamps beyond). Exported for unit testing without a
 *  layout engine or rAF. */
export function edgeScroll(
  point: { x: number; y: number },
  rect: { top: number; bottom: number; left: number; right: number },
  band = EDGE_BAND,
  max = EDGE_MAX_SPEED,
): { dx: number; dy: number } {
  const ramp = (over: number) => Math.min(max, (Math.min(over, band) / band) * max);
  let dy = 0;
  if (point.y < rect.top + band) dy = -ramp(rect.top + band - point.y);
  else if (point.y > rect.bottom - band) dy = ramp(point.y - (rect.bottom - band));
  let dx = 0;
  if (point.x < rect.left + band) dx = -ramp(rect.left + band - point.x);
  else if (point.x > rect.right - band) dx = ramp(point.x - (rect.right - band));
  return { dx, dy };
}

/** Spring-load (D4): how long (ms) the pointer must dwell over a closed tab/collapse
 *  header mid-drag before it auto-opens. */
const SPRING_DWELL_MS = 500;

/** Given the element under the pointer, return the CLOSED tab/collapse header that should
 *  spring open on dwell, or null. A tab is springable when it isn't the active tab; a
 *  collapse header when its panel isn't currently expanded. (Both render force-rendered
 *  but hidden children, so opening them turns the children into reachable drop targets.)
 *  Exported for unit testing without a real drag. */
export function springLoadTarget(el: Element | null): HTMLElement | null {
  if (!el) return null;
  const tab = el.closest(".ant-tabs-tab");
  if (tab && !tab.classList.contains("ant-tabs-tab-active")) return tab as HTMLElement;
  const header = el.closest(".ant-collapse-header");
  const item = header?.closest(".ant-collapse-item");
  if (header && item && !item.classList.contains("ant-collapse-item-active")) {
    return header as HTMLElement;
  }
  return null;
}

/** A viewport-space rectangle (client coords). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Normalize two corner points into a {@link Box} (marquee, D7). Exported for testing. */
export function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/** Axis-aligned rectangle overlap test (marquee hit, D7). Exported for testing. */
export function boxesIntersect(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Pixels the marquee pointer must travel before a press becomes a rubber-band (vs. a
 *  plain click that clears the selection). */
const MARQUEE_THRESHOLD = 4;

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
  beginCreate: (
    type: import("./field-registry").FieldType,
    e: React.PointerEvent,
    opts?: { patch?: Record<string, unknown>; label?: string },
  ) => void;
  copy: (uid: string) => void;
  remove: (uid: string) => void;
  /** Select a single node (Outline tree / breadcrumb); `additive` toggles it in a
   *  multi-selection. */
  select: (uid: string, additive?: boolean) => void;
  /** A press on empty canvas: the host decides (App selects the Form root). */
  clearSelection: () => void;
  /** Replace the selection with exactly these uids (D7 marquee). Empty → clears. */
  setSelected: (uids: string[]) => void;
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

  // D2 cursor states: a draggable node hints `grab` on hover/selection; during an active
  // drag the global body cursor (set in DesignCanvas) shows grabbing/no-drop, so the shell
  // bows out (undefined) to let it through. A pending column resize keeps `col-resize`.
  const shellCursor =
    resize || d.drag
      ? undefined
      : meta.behavior.draggable && (isHovered || selected)
        ? "grab"
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
        cursor: shellCursor,
      }}
    >
      {isHovered && (
        // The hover name tag doubles as an explicit drag handle (D2): a grip icon +
        // `grab` cursor make draggability discoverable without selecting first. Pressing
        // it starts the same move as pressing the body. Non-draggable nodes keep a plain,
        // inert label.
        <span
          className="designer-aux"
          title={meta.behavior.draggable ? "Drag to move" : undefined}
          onPointerDown={meta.behavior.draggable ? startMove : undefined}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: "translateY(-100%)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: BLUE,
            color: "#fff",
            fontSize: 11,
            lineHeight: "16px",
            padding: "0 6px",
            borderRadius: "2px 2px 0 0",
            cursor: meta.behavior.draggable ? "grab" : "default",
            pointerEvents: meta.behavior.draggable ? "auto" : "none",
            zIndex: 4,
            whiteSpace: "nowrap",
          }}
        >
          {meta.behavior.draggable && <HolderOutlined />}
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
  presetResolver,
}: {
  schema: unknown;
  /** Stable string key for the schema — resets the error boundary on a valid edit. */
  json: string;
  tree: TreeNode;
  theme?: ThemeConfig;
  /** Canvas content width — driven by the toolbar device simulator (F2). */
  maxWidth?: number;
  /** Resolves linked fields (W4) so the canvas shows live preset values. */
  presetResolver?: PresetResolver;
}) {
  const d = useDesigner();
  const { setHovered } = useHover();
  // D2: while a drag is in flight, show a global grabbing / no-drop cursor across the
  // whole canvas (including the gaps between shells), then restore on drop/abort.
  useEffect(() => {
    document.body.style.cursor = d.drag ? (d.drag.valid ? "grabbing" : "no-drop") : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [d.drag]);

  // D3 auto-scroll: a single rAF loop runs for the lifetime of one drag, reading the
  // latest pointer through a ref (so the per-move re-renders don't restart the loop) and
  // scrolling the viewport when the pointer enters the edge band — lets you drag into a
  // node that's currently scrolled off-screen.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  pointRef.current = d.drag?.point ?? null;
  // D4 spring-load: the header the pointer is currently dwelling over, with the timestamp
  // the dwell began — reset when the pointer leaves it.
  const springRef = useRef<{ el: HTMLElement; since: number } | null>(null);
  const dragging = !!d.drag;
  useEffect(() => {
    if (!dragging) {
      springRef.current = null;
      return;
    }
    let raf = 0;
    const tick = () => {
      const el = scrollRef.current;
      const p = pointRef.current;
      if (el && p) {
        const { dx, dy } = edgeScroll(p, el.getBoundingClientRect());
        if (dx) el.scrollLeft += dx;
        if (dy) el.scrollTop += dy;
        // D4: dwell over a closed tab/collapse header → click it open so its hidden
        // children become drop targets. Tabs/collapse are uncontrolled, so a synthetic
        // click is enough — no renderer change needed.
        const target = springLoadTarget(document.elementFromPoint(p.x, p.y));
        if (!target) {
          springRef.current = null;
        } else if (springRef.current?.el !== target) {
          springRef.current = { el: target, since: performance.now() };
        } else if (performance.now() - springRef.current.since > SPRING_DWELL_MS) {
          target.click();
          springRef.current = null;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

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
          presetResolver={presetResolver}
        />
      </CanvasBoundary>
    ),
    [schema, json, theme, wrapper, presetResolver],
  );

  // D7 marquee select: a rubber-band drag from empty canvas selects every node shell it
  // intersects. A press that never crosses the threshold falls back to the old behavior
  // (clear → select the Form root). Node shells stopPropagation their own pointerdown, so
  // this only ever starts on empty space.
  const [marquee, setMarquee] = useState<Box | null>(null);
  const collectHits = useCallback(
    (box: Box): string[] => {
      const host = scrollRef.current;
      if (!host) return [];
      const uids: string[] = [];
      for (const el of host.querySelectorAll("[data-designer-node-id]")) {
        const uid = el.getAttribute("data-designer-node-id");
        // Skip the root card itself — marquee selects fields, not the whole form.
        if (!uid || uid === tree.uid) continue;
        if (boxesIntersect(box, el.getBoundingClientRect())) uids.push(uid);
      }
      // Collapse parent+descendant hits to the top-most nodes (like a multi-drag/copy).
      return topMostUids(tree, uids);
    },
    [tree],
  );
  const startMarquee = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < MARQUEE_THRESHOLD) {
        return;
      }
      moved = true;
      setMarquee(normalizeBox(start, { x: ev.clientX, y: ev.clientY }));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) d.clearSelection();
      else d.setSelected(collectHits(normalizeBox(start, { x: ev.clientX, y: ev.clientY })));
      setMarquee(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: 24,
          background: "#f5f5f5",
          position: "relative",
        }}
        // A press on empty canvas starts a marquee; a no-move press clears the selection.
        onPointerDown={startMarquee}
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

      {marquee && (
        // D7 rubber-band overlay (viewport-space, so it uses client coords directly).
        <div
          data-testid="marquee"
          style={{
            position: "fixed",
            left: marquee.left,
            top: marquee.top,
            width: marquee.right - marquee.left,
            height: marquee.bottom - marquee.top,
            border: `1px solid ${BLUE}`,
            background: "rgba(22,119,255,0.08)",
            pointerEvents: "none",
            zIndex: 999,
          }}
        />
      )}
    </>
  );
}
