/* ----------------------------------------------------------------------------
 * Hover state for the designer canvas. Trivial today; the pointer-driven drag
 * engine (Phase E2/E3) drives it as the cursor moves over nodes. Kept pure and
 * separate from selection so a hover never churns the selection-bound renders.
 * ------------------------------------------------------------------------- */

export interface HoverState {
  /** uid of the node under the pointer, or null when nothing is hovered. */
  hovered: string | null;
}

export const noHover: HoverState = { hovered: null };

export function isHovered(state: HoverState, uid: string): boolean {
  return state.hovered === uid;
}

export function setHover(state: HoverState, uid: string | null): HoverState {
  return state.hovered === uid ? state : { hovered: uid };
}

export function clearHover(state: HoverState): HoverState {
  return state.hovered === null ? state : noHover;
}
