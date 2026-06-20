import type { FieldNode, FormLayoutProps, FormSchema, I18nMap } from "@org/form-schema";
import { uniqueName } from "./names";
import { makeUid } from "./uid";

/* ----------------------------------------------------------------------------
 * The designer tree (Designable's TreeNode rebuilt as pure TS).
 *
 * A node's STRUCTURE lives in `children`; its schema props live in `node` with
 * the schema's own child arrays (`children` / `itemFields`) stripped, so there
 * is exactly one source of truth for nesting. The Form root is itself a node
 * (type "form") — droppable but never draggable/deletable, enforced by metas.
 *
 * Every op is pure: it returns a NEW tree that path-copies only the spine from
 * the root to the touched node (untouched siblings keep reference identity).
 * An invalid op returns the SAME root reference, so callers can cheaply detect
 * "nothing happened" with `===`.
 * ------------------------------------------------------------------------- */

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Schema node props with the child arrays stripped (structure lives in TreeNode). */
export type FieldProps = DistributiveOmit<FieldNode, "children" | "itemFields">;

/** The root Form node's props (id/title/layoutProps/settings of the FormSchema). */
export interface FormProps {
  type: "form";
  id: string;
  title: string;
  layoutProps?: FormLayoutProps;
  settings?: FormSchema["settings"];
  /** Localized overrides of the form's own text (currently `title`). */
  i18n?: I18nMap;
  /** Locale the authored strings are written in (default for every node's `i18n`). */
  defaultLocale?: string;
  /** Extra locales this form offers translations for. */
  locales?: string[];
}

export type EngineProps = FormProps | FieldProps;

export interface TreeNode {
  uid: string;
  node: EngineProps;
  children: TreeNode[];
}

/** Insert/move guard injected by the caller (the ComponentMeta registry).
 *  The engine itself stays meta-agnostic; absent guard = allow everything
 *  except the engine's own invariants (no second root, no cycles). */
export type InsertGuard = (parent: TreeNode, child: TreeNode) => boolean;

// --- queries -----------------------------------------------------------------

export function findNode(root: TreeNode, uid: string): TreeNode | null {
  if (root.uid === uid) return root;
  for (const child of root.children) {
    const hit = findNode(child, uid);
    if (hit) return hit;
  }
  return null;
}

export function findParent(
  root: TreeNode,
  uid: string,
): { parent: TreeNode; index: number } | null {
  const index = root.children.findIndex((c) => c.uid === uid);
  if (index !== -1) return { parent: root, index };
  for (const child of root.children) {
    const hit = findParent(child, uid);
    if (hit) return hit;
  }
  return null;
}

/** The path [root, …, node] for breadcrumbs; null when the uid is gone. */
export function ancestorsOf(root: TreeNode, uid: string): TreeNode[] | null {
  if (root.uid === uid) return [root];
  for (const child of root.children) {
    const sub = ancestorsOf(child, uid);
    if (sub) return [root, ...sub];
  }
  return null;
}

/** True when `uid` is `node` itself or any of its descendants. */
export function contains(node: TreeNode, uid: string): boolean {
  return findNode(node, uid) !== null;
}

/** Of `uids`, those with no ancestor also in the set — the "top-most" nodes, so a
 *  multi-selection drag/copy moves a parent once instead of also moving its children.
 *  Input order is preserved; uids absent from the tree are dropped. */
export function topMostUids(root: TreeNode, uids: string[]): string[] {
  const set = new Set(uids);
  return uids.filter((uid) => {
    const path = ancestorsOf(root, uid);
    if (!path) return false;
    return !path.slice(0, -1).some((a) => set.has(a.uid));
  });
}

/** Every schema `name` in the tree (nameless containers are skipped). */
export function collectNames(root: TreeNode): Set<string> {
  const names = new Set<string>();
  const walk = (n: TreeNode) => {
    const props = n.node;
    if (props.type !== "form" && "name" in props && typeof props.name === "string") {
      names.add(props.name);
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return names;
}

// --- internals ---------------------------------------------------------------

/** Path-copy the spine down to `uid` and apply `fn` to that node. Returns the
 *  same root reference when the uid is absent. Exported so the transformer's
 *  `replaceField` can swap a whole subtree through the same path-copy. */
export function replaceAt(root: TreeNode, uid: string, fn: (n: TreeNode) => TreeNode): TreeNode {
  if (root.uid === uid) return fn(root);
  let changed = false;
  const children = root.children.map((c) => {
    if (changed) return c; // uids are unique; stop touching siblings after a hit
    const next = replaceAt(c, uid, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

function insertAt(
  root: TreeNode,
  siblingUid: string,
  child: TreeNode,
  offset: 0 | 1,
  guard?: InsertGuard,
): TreeNode {
  if (child.node.type === "form") return root;
  if (root.uid === siblingUid) return root; // nothing sits beside the root
  const loc = findParent(root, siblingUid);
  if (!loc) return root;
  if (guard && !guard(loc.parent, child)) return root;
  return replaceAt(root, loc.parent.uid, (p) => {
    const children = p.children.slice();
    children.splice(loc.index + offset, 0, child);
    return { ...p, children };
  });
}

// --- ops ----------------------------------------------------------------------

export function append(
  root: TreeNode,
  parentUid: string,
  child: TreeNode,
  guard?: InsertGuard,
): TreeNode {
  if (child.node.type === "form") return root;
  const parent = findNode(root, parentUid);
  if (!parent) return root;
  if (guard && !guard(parent, child)) return root;
  return replaceAt(root, parentUid, (p) => ({ ...p, children: [...p.children, child] }));
}

export function insertBefore(
  root: TreeNode,
  siblingUid: string,
  child: TreeNode,
  guard?: InsertGuard,
): TreeNode {
  return insertAt(root, siblingUid, child, 0, guard);
}

export function insertAfter(
  root: TreeNode,
  siblingUid: string,
  child: TreeNode,
  guard?: InsertGuard,
): TreeNode {
  return insertAt(root, siblingUid, child, 1, guard);
}

/** Remove the node at `uid`. The root itself is not removable. */
export function remove(root: TreeNode, uid: string): TreeNode {
  if (root.uid === uid) return root;
  const loc = findParent(root, uid);
  if (!loc) return root;
  return replaceAt(root, loc.parent.uid, (p) => ({
    ...p,
    children: p.children.filter((c) => c.uid !== uid),
  }));
}

export type MoveTarget =
  | { kind: "before" | "after"; uid: string }
  | { kind: "append"; uid: string };

/** Move an existing node next to (or into) the target. Rejected: moving the
 *  root, moving onto itself, or into its own subtree (cycle guard). */
export function move(
  root: TreeNode,
  uid: string,
  target: MoveTarget,
  guard?: InsertGuard,
): TreeNode {
  if (root.uid === uid) return root;
  if (target.uid === uid) return root;
  const node = findNode(root, uid);
  if (!node) return root;
  if (contains(node, target.uid)) return root; // would create a cycle
  const destParent =
    target.kind === "append"
      ? findNode(root, target.uid)
      : (findParent(root, target.uid)?.parent ?? null);
  if (!destParent) return root;
  if (guard && !guard(destParent, node)) return root;

  // Detach first, then insert relative to the target, which is guaranteed to
  // survive the detach (it is neither the moved node nor inside its subtree).
  const without = remove(root, uid);
  if (without === root) return root;
  if (target.kind === "append") {
    return replaceAt(without, target.uid, (p) => ({ ...p, children: [...p.children, node] }));
  }
  return insertAt(without, target.uid, node, target.kind === "after" ? 1 : 0);
}

/** Keyboard reorder direction (D6): up/down swap with a sibling; in/out re-parent. */
export type NudgeDir = "up" | "down" | "in" | "out";

/** Keyboard-driven move of a single node, expressed over {@link move}:
 *  - `up`/`down`  : swap with the previous/next sibling (same parent).
 *  - `in`         : become the last child of the previous sibling (indent) — a no-op
 *                   when the guard rejects it (e.g. the sibling is a leaf).
 *  - `out`        : move just after the parent, into the grandparent (outdent).
 *  Returns the same tree (===) when the move is impossible, so callers can skip a
 *  history entry. */
export function keyboardMove(
  root: TreeNode,
  uid: string,
  dir: NudgeDir,
  guard?: InsertGuard,
): TreeNode {
  if (root.uid === uid) return root;
  const loc = findParent(root, uid);
  if (!loc) return root;
  const { parent, index } = loc;
  const sibs = parent.children;
  if (dir === "up") {
    return index > 0 ? move(root, uid, { kind: "before", uid: sibs[index - 1].uid }, guard) : root;
  }
  if (dir === "down") {
    return index < sibs.length - 1
      ? move(root, uid, { kind: "after", uid: sibs[index + 1].uid }, guard)
      : root;
  }
  if (dir === "in") {
    return index > 0 ? move(root, uid, { kind: "append", uid: sibs[index - 1].uid }, guard) : root;
  }
  // out: place after the parent in the grandparent; impossible when the parent is the root.
  return parent.uid === root.uid
    ? root
    : move(root, uid, { kind: "after", uid: parent.uid }, guard);
}

/** Shallow-merge `patch` into the node's schema props (structure untouched). */
export function patchNode(root: TreeNode, uid: string, patch: Partial<EngineProps>): TreeNode {
  if (!findNode(root, uid)) return root;
  return replaceAt(root, uid, (n) => ({ ...n, node: { ...n.node, ...patch } as EngineProps }));
}

/** antd responsive breakpoints carried by `layout.colSpan` (the D8 drag-resize keys). */
export type ColSpanKey = "xs" | "sm" | "md" | "lg";

/** Field types with NO `layout` slot: the form root and the label-only sub-containers.
 *  Everything else (every leaf, group/array/tabs/collapse/card/grid/space/steps) carries
 *  an optional `layout`. */
const NO_LAYOUT_TYPES: ReadonlySet<string> = new Set([
  "form",
  "tab-pane",
  "collapse-panel",
  "step",
]);

/** Write `layout.colSpan[key]` (1..24) on a field, CREATING the layout/colSpan slot when
 *  absent — checking the node TYPE, not whether a `layout` key already exists, so a field
 *  that was never given a layout (e.g. a fresh select) still receives its first span.
 *  No-op (same root) for an unknown uid or a layout-less node. */
export function setColSpan(root: TreeNode, uid: string, key: ColSpanKey, span: number): TreeNode {
  const found = findNode(root, uid);
  if (!found || NO_LAYOUT_TYPES.has(found.node.type)) return root;
  const layout = (found.node as { layout?: { colSpan?: Record<string, number> } }).layout ?? {};
  const colSpan = { ...(layout.colSpan ?? {}), [key]: span };
  const patch = { layout: { ...layout, colSpan } };
  return patchNode(root, uid, patch);
}

/** Deep-copy a subtree for paste/duplicate: every node gets a fresh uid and
 *  every NAMED descendant gets a name unique against `taken` (and against the
 *  other names generated during this same clone). */
export function clone(node: TreeNode, taken: ReadonlySet<string>): TreeNode {
  const pool = new Set(taken);
  const walk = (n: TreeNode): TreeNode => {
    let props: EngineProps = { ...n.node };
    if (props.type !== "form" && "name" in props && typeof props.name === "string") {
      const name = uniqueName(props.name, pool);
      pool.add(name);
      props = { ...props, name } as EngineProps;
    }
    return { uid: makeUid(), node: props, children: n.children.map(walk) };
  };
  return walk(node);
}
