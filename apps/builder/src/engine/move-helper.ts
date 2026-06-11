/* ----------------------------------------------------------------------------
 * MoveHelper — Designable's "closest direction" insertion math, rebuilt as pure
 * geometry. Given the rect of the node under the pointer, the pointer position,
 * the flow axis of that node's parent, and whether the node can accept children,
 * it returns a single drop intent: insert BEFORE / AFTER the node (as a sibling)
 * or INNER (append into it). No DOM, no React — the drag controller feeds it
 * rects read from the canvas and the result drives both the insertion line and
 * the committed tree op.
 * ------------------------------------------------------------------------- */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The direction siblings flow in the target's parent. `grid`/`space` lay out
 *  horizontally; every other container stacks vertically. */
export type Axis = "vertical" | "horizontal";

export type DropIntent =
  | { kind: "before"; uid: string }
  | { kind: "after"; uid: string }
  | { kind: "inner"; uid: string };

export interface DropTarget {
  uid: string;
  rect: Rect;
  /** Flow axis of the target's PARENT (decides before/after orientation). */
  axis: Axis;
  /** Can the target itself accept children (is it a droppable container)? */
  droppable: boolean;
}

/** Fraction of the target's length, at each end, that reads as before/after when the
 *  target is a droppable container; the middle band reads as INNER (append). */
const DEFAULT_EDGE = 0.25;

/** The pointer's position along `axis` as a 0..1 fraction of the target's length. */
function fraction(rect: Rect, axis: Axis, point: Point): number {
  const [start, end, pos] =
    axis === "vertical" ? [rect.top, rect.bottom, point.y] : [rect.left, rect.right, point.x];
  const size = end - start;
  if (size <= 0) return 0.5; // degenerate rect → treat as the midpoint
  return (pos - start) / size;
}

/** Resolve where a drop on `target` lands.
 *  - A non-droppable node (a leaf) only takes a sibling: before/after by the midline.
 *  - A droppable container takes a sibling near either edge and INNER in the middle,
 *    so an empty container (one big middle band) naturally reads as append. */
export function dropIntent(
  target: DropTarget,
  point: Point,
  edge: number = DEFAULT_EDGE,
): DropIntent {
  const f = fraction(target.rect, target.axis, point);
  if (!target.droppable) {
    return f < 0.5 ? { kind: "before", uid: target.uid } : { kind: "after", uid: target.uid };
  }
  if (f < edge) return { kind: "before", uid: target.uid };
  if (f > 1 - edge) return { kind: "after", uid: target.uid };
  return { kind: "inner", uid: target.uid };
}
