import { canInsert, type FieldType, type NodeType } from "../field-registry";
import type { Axis, DropIntent } from "./move-helper";
import {
  append,
  collectNames,
  contains,
  findNode,
  findParent,
  type InsertGuard,
  insertAfter,
  insertBefore,
  type MoveTarget,
  move,
  type TreeNode,
} from "./tree";

/* ----------------------------------------------------------------------------
 * Dragon — the pure core of Designable's pointer drag engine. The DOM seam
 * (pointer listeners + `elementFromPoint` hit-testing) lands with the canvas in
 * E3; this module is the framework-free reducer it drives:
 *   - `axisOf`        : a parent type's sibling flow axis (for the MoveHelper)
 *   - `canDrop`       : may this source land at this intent? (drives the line colour)
 *   - `performDrop`   : the SINGLE tree op a drop commits (create or move)
 * Everything here is pure and returns the same tree reference when a drop is
 * rejected, so the canvas can detect "nothing happened" with `===`.
 * ------------------------------------------------------------------------- */

/** What is being dragged: a fresh node from the palette, or existing node(s). */
export type DragSource =
  | { kind: "create"; fieldType: FieldType }
  | { kind: "move"; uids: string[] };

/** `grid`/`space` flow horizontally; everything else stacks vertically. */
export function axisOf(parentType: string): Axis {
  return parentType === "grid" || parentType === "space" ? "horizontal" : "vertical";
}

function typeOf(tree: TreeNode, uid: string): NodeType | null {
  return findNode(tree, uid)?.node.type ?? null;
}

function parentTypeOf(tree: TreeNode, uid: string): NodeType | null {
  return findParent(tree, uid)?.parent.node.type ?? null;
}

/** The parent type a drop would insert the child into: the target itself for an
 *  INNER drop, otherwise the target's parent (sibling before/after). */
export function dropParentType(tree: TreeNode, intent: DropIntent): NodeType | null {
  return intent.kind === "inner" ? typeOf(tree, intent.uid) : parentTypeOf(tree, intent.uid);
}

/** Would this drop be accepted? Mirrors the engine ops' own guards (meta `canInsert`
 *  + no moving the root, onto itself, or into its own subtree) so the canvas can
 *  colour the insertion line before committing. */
export function canDrop(tree: TreeNode, source: DragSource, intent: DropIntent): boolean {
  const parentType = dropParentType(tree, intent);
  if (!parentType) return false;

  if (source.kind === "create") return canInsert(parentType, source.fieldType);

  return source.uids.every((uid) => {
    const node = findNode(tree, uid);
    if (!node || node.node.type === "form") return false; // root never moves
    if (intent.uid === uid) return false; // onto itself
    if (contains(node, intent.uid)) return false; // into its own subtree (cycle)
    return canInsert(parentType, node.node.type);
  });
}

/** Map a drop intent to a tree-engine move target. */
export function intentToMoveTarget(intent: DropIntent): MoveTarget {
  return intent.kind === "inner"
    ? { kind: "append", uid: intent.uid }
    : { kind: intent.kind, uid: intent.uid };
}

export interface DropResult {
  next: TreeNode;
  /** uids to select after the drop (the created or moved nodes). */
  selected: string[];
}

/** Commit a drop as ONE conceptual edit and report what to select. Returns null
 *  when nothing changed (rejected by a guard). `createNode` builds a fresh tree
 *  node for a palette drag (injected so this module stays free of the registry's
 *  factory wiring). */
export function performDrop(
  tree: TreeNode,
  source: DragSource,
  intent: DropIntent,
  guard: InsertGuard,
  createNode: (type: FieldType, taken: ReadonlySet<string>) => TreeNode,
): DropResult | null {
  if (source.kind === "create") {
    const child = createNode(source.fieldType, collectNames(tree));
    let next: TreeNode;
    if (intent.kind === "inner") next = append(tree, intent.uid, child, guard);
    else if (intent.kind === "before") next = insertBefore(tree, intent.uid, child, guard);
    else next = insertAfter(tree, intent.uid, child, guard);
    return next === tree ? null : { next, selected: [child.uid] };
  }

  // Move existing node(s). For an "after" drop the anchor advances so the moved
  // group keeps its order (target, a, b); "before"/"inner" keep order naturally.
  let next = tree;
  const selected: string[] = [];
  let anchor = intent.uid;
  for (const uid of source.uids) {
    const target: MoveTarget =
      intent.kind === "inner"
        ? { kind: "append", uid: intent.uid }
        : { kind: intent.kind, uid: anchor };
    const moved = move(next, uid, target, guard);
    if (moved === next) continue; // rejected — keep the anchor for the rest
    next = moved;
    selected.push(uid);
    if (intent.kind === "after") anchor = uid;
  }
  return next === tree ? null : { next, selected };
}
