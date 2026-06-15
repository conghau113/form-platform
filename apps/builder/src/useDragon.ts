import { useEffect, useRef, useState } from "react";
import { axisOf, canDrop, type DragSource, performDrop } from "./engine/dragon";
import { type DropIntent, dropIntent, type Rect } from "./engine/move-helper";
import { findNode, findParent, type InsertGuard, type TreeNode, topMostUids } from "./engine/tree";
import { describeNode, type FieldType, fieldTypeLabel } from "./field-registry";

/* ----------------------------------------------------------------------------
 * useDragon — the DOM seam over the pure drag core (engine/dragon.ts). A drag
 * starts on a palette chip (`beginCreate`) or a canvas node (`beginMove`); the
 * hook tracks the pointer, hit-tests `[data-designer-node-id]` shells with
 * `elementFromPoint`, asks the MoveHelper for a before/after/inner intent,
 * validates it with `canDrop`, and on pointer-up commits ONE tree op. A press
 * that never crosses the move threshold is a click → `onClickSelect`.
 * ------------------------------------------------------------------------- */

const THRESHOLD = 4; // px the pointer must travel before a press becomes a drag

export interface DragState {
  source: DragSource;
  /** Current pointer position (drives the drag ghost). */
  point: { x: number; y: number };
  intent: DropIntent | null;
  /** Flow axis of the intent target's parent (orients the insertion line). */
  axis: "vertical" | "horizontal";
  valid: boolean;
  /** Human label for the drag ghost. */
  label: string;
  /** Alt held → the drop clones instead of moves (drives the ghost's copy hint). */
  copy: boolean;
}

interface Pending {
  source: DragSource;
  label: string;
  start: { x: number; y: number };
  additive: boolean;
  /** The uid a click (no drag) selects — the pressed node, even when dragging a
   *  larger multi-selection. */
  clickUid: string | null;
  active: boolean;
  intent: DropIntent | null;
  valid: boolean;
  /** Whether Alt was held as of the last pointer event (copy-on-drag). */
  copy: boolean;
}

/** The source as it lands: a move drag becomes a copy while Alt is held. */
function effectiveSource(p: Pending): DragSource {
  return p.source.kind === "move" ? { ...p.source, copy: p.copy } : p.source;
}

export interface UseDragonOptions {
  getTree: () => TreeNode;
  guard: InsertGuard;
  createNode: (type: FieldType, taken: ReadonlySet<string>) => TreeNode;
  /** Commit a drop: swap in the new tree and select the dropped node(s). */
  commit: (next: TreeNode, selected: string[]) => void;
  /** A press that didn't become a drag selected these node(s). */
  onClickSelect: (uids: string[], additive: boolean) => void;
}

export interface Dragon {
  drag: DragState | null;
  /** Start moving `uids` (filtered to top-most). `clickUid` is the node a non-drag
   *  press selects (defaults to the first uid). */
  beginMove: (uids: string[], e: React.PointerEvent, clickUid?: string) => void;
  beginCreate: (type: FieldType, e: React.PointerEvent) => void;
}

function toRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Display label for the node being moved (or "N items" for a multi-selection). */
function moveLabel(tree: TreeNode, uids: string[]): string {
  if (uids.length !== 1) return `${uids.length} items`;
  const node = findNode(tree, uids[0])?.node;
  if (!node) return "node";
  if ("label" in node && node.label) return node.label;
  if ("title" in node && node.title) return node.title;
  if ("name" in node && node.name) return node.name;
  return node.type;
}

export function useDragon(opts: UseDragonOptions): Dragon {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Latest opts + the in-flight press, read through a ref so the window listeners
  // (installed once) never go stale.
  const ref = useRef({ opts, pend: null as Pending | null });
  ref.current.opts = opts;

  // Exposed so the unmount effect below can tear down any in-flight drag listeners.
  const cleanupRef = useRef<() => void>(() => {});

  const api = useRef<Dragon | null>(null);
  if (!api.current) {
    const onMove = (e: PointerEvent) => {
      const p = ref.current.pend;
      if (!p) return;
      const dx = e.clientX - p.start.x;
      const dy = e.clientY - p.start.y;
      if (!p.active && Math.hypot(dx, dy) < THRESHOLD) return;
      p.active = true;
      p.copy = e.altKey;
      const source = effectiveSource(p);

      const tree = ref.current.opts.getTree();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const shell = el?.closest("[data-designer-node-id]") as HTMLElement | null;
      const uid = shell?.getAttribute("data-designer-node-id") ?? null;

      let intent: DropIntent | null = null;
      let axis: "vertical" | "horizontal" = "vertical";
      let valid = false;
      const node = uid ? findNode(tree, uid) : null;
      if (uid && shell && node) {
        const droppable = describeNode(node.node.type).behavior.droppable;
        const parent = findParent(tree, uid);
        axis = axisOf(parent?.parent.node.type ?? "form");
        intent = dropIntent(
          { uid, rect: toRect(shell.getBoundingClientRect()), axis, droppable },
          { x: e.clientX, y: e.clientY },
          // The root has no siblings, so before/after are meaningless: edge 0 makes the
          // whole form card read as INNER (append into the form) at any pointer position.
          parent ? undefined : 0,
        );
        valid = canDrop(tree, source, intent);
      }
      p.intent = intent;
      p.valid = valid;
      setDrag({
        source,
        point: { x: e.clientX, y: e.clientY },
        intent,
        axis,
        valid,
        label: p.label,
        copy: p.copy,
      });
    };

    const onUp = (e: PointerEvent) => {
      const p = ref.current.pend;
      cleanup();
      if (!p) return;
      if (!p.active) {
        // A click, not a drag: select the pressed node (not the whole drag set).
        if (p.source.kind === "move" && p.clickUid) {
          ref.current.opts.onClickSelect([p.clickUid], p.additive);
        }
        return;
      }
      // The modifier as of release is authoritative for move-vs-copy.
      p.copy = e.altKey;
      if (p.intent && p.valid) {
        const o = ref.current.opts;
        const res = performDrop(o.getTree(), effectiveSource(p), p.intent, o.guard, o.createNode);
        if (res) o.commit(res.next, res.selected);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cleanup();
    };

    // A browser-cancelled pointer (OS gesture, etc.) aborts the drag without a drop.
    const onCancel = () => cleanup();

    function cleanup() {
      ref.current.pend = null;
      setDrag(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    }
    cleanupRef.current = cleanup;

    const begin = (
      source: DragSource,
      label: string,
      e: React.PointerEvent,
      additive: boolean,
      clickUid: string | null,
    ) => {
      e.preventDefault();
      cleanup();
      ref.current.pend = {
        source,
        label,
        start: { x: e.clientX, y: e.clientY },
        additive,
        clickUid,
        active: false,
        intent: null,
        valid: false,
        copy: false,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey);
    };

    api.current = {
      drag: null,
      beginMove: (uids, e, clickUid) => {
        const tree = ref.current.opts.getTree();
        // Drag parents once, not their already-selected children.
        const tops = topMostUids(tree, uids);
        begin(
          { kind: "move", uids: tops },
          moveLabel(tree, tops),
          e,
          e.ctrlKey || e.metaKey,
          clickUid ?? uids[0] ?? null,
        );
      },
      beginCreate: (type, e) =>
        begin({ kind: "create", fieldType: type }, fieldTypeLabel(type), e, false, null),
    };
  }

  // Tear down any in-flight drag listeners if the host unmounts mid-press (e.g. the
  // builder switches away from form mode between pointerdown and pointerup).
  useEffect(() => () => cleanupRef.current(), []);

  return { ...api.current, drag };
}
