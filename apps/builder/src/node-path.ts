import type { ArrayField, FieldNode } from "@org/form-schema";

/**
 * A drill path into an array node's nested `itemFields`. Each number is an index
 * into the `itemFields` of the array reached so far. `[]` is the node itself, `[2]`
 * is its 3rd item field, `[2, 0]` is that item's own 1st item field (nested arrays).
 * Used by the builder's PropertyPanel to edit a deeply nested item field with the
 * full property editor while still committing a single shallow patch at the top.
 */
export type NodePath = number[];

/** Read the item fields of a node, or undefined if it isn't an array container. */
function itemFieldsOf(node: FieldNode): FieldNode[] | undefined {
  return node.type === "array" ? node.itemFields : undefined;
}

/** Resolve the node at `path` under `root`, or null if the path doesn't exist
 *  (e.g. an index went stale after an item was removed). */
export function nodeAtPath(root: FieldNode, path: NodePath): FieldNode | null {
  let node: FieldNode = root;
  for (const index of path) {
    const items = itemFieldsOf(node);
    const next = items?.[index];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Return a fresh copy of `root` with `patch` shallow-merged into the node at `path`.
 *  `path === []` merges into `root` itself. Containers along the path are copied (their
 *  siblings are left untouched), so the result is a new tree safe to set as state. */
export function patchNodeAtPath(
  root: FieldNode,
  path: NodePath,
  patch: Record<string, unknown>,
): FieldNode {
  if (path.length === 0) return { ...root, ...patch } as FieldNode;
  const [index, ...rest] = path;
  // Only array nodes have item fields; a non-array along the path is a no-op.
  if (root.type !== "array") return root;
  const itemFields = root.itemFields.map((child, i) =>
    i === index ? patchNodeAtPath(child, rest, patch) : child,
  );
  return { ...(root as ArrayField), itemFields };
}
