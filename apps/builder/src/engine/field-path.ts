import { childrenKeyOf, childrenOf, type FieldNode } from "@org/form-schema";

/**
 * A drill path into a node's nested children. Each number indexes into the child
 * list of the node reached so far — `children` for layout containers, `itemFields`
 * for an `array`, nothing for a leaf. `[]` is the node itself, `[2]` its 3rd child,
 * `[2, 0]` that child's 1st child. The PropertyPanel uses this to edit a deeply
 * nested field with the full editor while committing a single rebuilt top-level node.
 *
 * Walking via {@link childrenOf} (not just `array.itemFields`) is what fixes the old
 * node-path bug where an edit to a leaf nested under a card inside `itemFields` was
 * silently dropped.
 */
export type NodePath = number[];

/** Resolve the node at `path` under `root`, or null if the path doesn't exist
 *  (e.g. an index went stale after a child was removed). */
export function nodeAtPath(root: FieldNode, path: NodePath): FieldNode | null {
  let node: FieldNode = root;
  for (const index of path) {
    const kids = childrenOf(node);
    const next = kids?.[index];
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Return a fresh copy of `root` with `patch` shallow-merged into the node at `path`.
 *  `path === []` merges into `root` itself. Nodes along the path are copied (siblings
 *  untouched), so the result is a new tree safe to set as state. A path that runs
 *  through a childless leaf is a no-op (returns the same reference for that subtree). */
export function patchNodeAtPath(
  root: FieldNode,
  path: NodePath,
  patch: Record<string, unknown>,
): FieldNode {
  if (path.length === 0) return { ...root, ...patch } as FieldNode;
  const [index, ...rest] = path;
  const key = childrenKeyOf(root.type);
  const kids = childrenOf(root);
  if (!key || !kids) return root; // a leaf along the path → nothing to descend into
  const nextKids = kids.map((child, i) =>
    i === index ? patchNodeAtPath(child, rest, patch) : child,
  );
  return { ...root, [key]: nextKids } as FieldNode;
}
