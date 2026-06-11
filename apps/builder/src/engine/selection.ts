import { findNode, type TreeNode } from "./tree";

/* ----------------------------------------------------------------------------
 * Selection state for the designer (Designable's selection model as pure TS).
 *
 * `selected` holds node uids in click order. Every op is pure and returns the
 * SAME state reference when nothing changes, so React can bail out of renders.
 * ------------------------------------------------------------------------- */

export interface SelectionState {
  selected: string[];
}

export const emptySelection: SelectionState = { selected: [] };

export function isSelected(state: SelectionState, uid: string): boolean {
  return state.selected.includes(uid);
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Replace the selection with a single node (plain click). */
export function select(state: SelectionState, uid: string): SelectionState {
  if (state.selected.length === 1 && state.selected[0] === uid) return state;
  return { selected: [uid] };
}

/** Add `uid` if absent, drop it if present (ctrl/cmd-click multi-select). */
export function toggle(state: SelectionState, uid: string): SelectionState {
  return isSelected(state, uid)
    ? { selected: state.selected.filter((u) => u !== uid) }
    : { selected: [...state.selected, uid] };
}

/** Replace the selection with an explicit set (deduped, order preserved). */
export function selectMany(state: SelectionState, uids: string[]): SelectionState {
  const next = [...new Set(uids)];
  return sameOrder(state.selected, next) ? state : { selected: next };
}

export function clearSelection(state: SelectionState): SelectionState {
  return state.selected.length === 0 ? state : emptySelection;
}

/** Drop selected uids that no longer exist in `root` (after delete/undo). */
export function pruneSelection(state: SelectionState, root: TreeNode): SelectionState {
  const alive = state.selected.filter((uid) => findNode(root, uid) !== null);
  return alive.length === state.selected.length ? state : { selected: alive };
}
