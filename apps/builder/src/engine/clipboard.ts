import type { SelectionState } from "./selection";
import {
  ancestorsOf,
  append,
  clone,
  collectNames,
  type InsertGuard,
  insertAfter,
  type TreeNode,
} from "./tree";

/* ----------------------------------------------------------------------------
 * Cut/copy/paste clipboard (Designable's copy/paste rebuilt as pure TS).
 *
 * `copyNodes` snapshots a detached deep copy of the TOP-MOST selected subtrees
 * (a node whose ancestor is also selected is skipped — it travels inside that
 * ancestor), preserving uids and names so paste can uniquify against whatever
 * tree it lands in. `pasteInto` / `pasteAfter` run the snapshot through engine
 * `clone`, minting fresh uids + names unique to the destination on every paste,
 * so the same clipboard pastes repeatedly without collisions.
 * ------------------------------------------------------------------------- */

export interface Clipboard {
  /** Detached deep copies of the copied subtrees (top-most-only, in order). */
  nodes: TreeNode[];
}

export const emptyClipboard: Clipboard = { nodes: [] };

export function hasContent(clip: Clipboard): boolean {
  return clip.nodes.length > 0;
}

/** Structural deep copy that PRESERVES uids and names (paste re-mints them). */
function deepCopy(node: TreeNode): TreeNode {
  return { uid: node.uid, node: { ...node.node }, children: node.children.map(deepCopy) };
}

/** The selected nodes that have no selected ancestor, in document order. */
function topMost(root: TreeNode, selected: string[]): TreeNode[] {
  const set = new Set(selected);
  const tops: TreeNode[] = [];
  for (const uid of selected) {
    const path = ancestorsOf(root, uid);
    if (!path) continue; // no longer in the tree
    const strictAncestors = path.slice(0, -1);
    if (strictAncestors.some((a) => set.has(a.uid))) continue;
    tops.push(path[path.length - 1]);
  }
  return tops;
}

export function copyNodes(root: TreeNode, selection: SelectionState): Clipboard {
  return { nodes: topMost(root, selection.selected).map(deepCopy) };
}

/** Append every clipboard node (freshly cloned) into `parentUid`. */
export function pasteInto(
  root: TreeNode,
  parentUid: string,
  clip: Clipboard,
  guard?: InsertGuard,
): TreeNode {
  let next = root;
  for (const node of clip.nodes) {
    next = append(next, parentUid, clone(node, collectNames(next)), guard);
  }
  return next;
}

/** Insert every clipboard node (freshly cloned) after `siblingUid`, in order. */
export function pasteAfter(
  root: TreeNode,
  siblingUid: string,
  clip: Clipboard,
  guard?: InsertGuard,
): TreeNode {
  let next = root;
  let anchor = siblingUid;
  for (const node of clip.nodes) {
    const copy = clone(node, collectNames(next));
    const after = insertAfter(next, anchor, copy, guard);
    if (after === next) continue; // rejected — keep the anchor for the rest
    next = after;
    anchor = copy.uid;
  }
  return next;
}
