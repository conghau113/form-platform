/**
 * Pure spatial node-picker for the editor's keyboard navigation (WE5b): given the node currently
 * selected and an arrow direction, return the id of the nearest node lying in that direction. The
 * editor uses it to move keyboard selection between states the way arrow keys move a cursor. No
 * React, no xyflow — unit-tested on plain coordinates (mirrors `path.ts`).
 *
 * "In that direction" = the candidate's center is displaced from the current center with the
 * correct sign on the primary axis AND the primary-axis displacement dominates the perpendicular
 * one (a 45° cone), so ←/→ never jump to a node that is mostly above/below. Ties broken by the
 * smallest Euclidean distance.
 */

export type Direction = "up" | "down" | "left" | "right";

/** The only node shape the picker needs (a FlowNode is structurally assignable). */
export interface NavNode {
  id: string;
  position: { x: number; y: number };
  width?: number | null;
  height?: number | null;
}

function center(n: NavNode): { x: number; y: number } {
  return {
    x: n.position.x + (n.width ?? 0) / 2,
    y: n.position.y + (n.height ?? 0) / 2,
  };
}

/** A node's bounding box in flow coordinates (mirrors what xyflow's `getNode` exposes). */
export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Canvas transform + pane size — enough to map flow coordinates to screen pixels. */
export interface ViewportRect {
  /** pan offset, px */
  x: number;
  y: number;
  zoom: number;
  /** pane size, px */
  width: number;
  height: number;
}

/**
 * Is `rect` (flow coords) fully inside the visible pane, keeping `padding` px of breathing room on
 * every side? Keyboard navigation uses this to pan ONLY when the focused node would be off-screen,
 * so arrow-stepping never loses the node — while a mouse click (which never reveals) stays put.
 */
export function isNodeVisible(rect: NodeRect, vp: ViewportRect, padding = 0): boolean {
  const left = rect.x * vp.zoom + vp.x;
  const top = rect.y * vp.zoom + vp.y;
  const right = left + rect.width * vp.zoom;
  const bottom = top + rect.height * vp.zoom;
  return (
    left >= padding &&
    top >= padding &&
    right <= vp.width - padding &&
    bottom <= vp.height - padding
  );
}

/** Id of the nearest node from `currentId` in `dir`, or null if there is none (or no current). */
export function pickNeighbor(
  nodes: NavNode[],
  currentId: string | null,
  dir: Direction,
): string | null {
  if (currentId === null) return null;
  const current = nodes.find((n) => n.id === currentId);
  if (!current) return null;
  const from = center(current);

  let bestId: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const n of nodes) {
    if (n.id === currentId) continue;
    const to = center(n);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // Primary-axis displacement (signed for the requested direction) must be positive and dominate.
    const primary = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    const perpendicular = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (primary <= 0 || primary < perpendicular) continue;

    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = n.id;
    }
  }
  return bestId;
}
