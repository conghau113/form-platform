import {
  CURRENT_FORM_VERSION,
  childrenKeyOf,
  childrenOf,
  type FieldNode,
  type FormSchema,
  isLayoutContainer,
} from "@org/form-schema";
import {
  type EngineProps,
  type FieldProps,
  type FormProps,
  findNode,
  patchNode,
  replaceAt,
  type TreeNode,
} from "./tree";
import { makeUid } from "./uid";

/* ----------------------------------------------------------------------------
 * TreeNode ⇄ FormSchema transformer.
 *
 * The designer tree keeps STRUCTURE in `TreeNode.children` and props (minus the
 * schema's own child arrays) in `TreeNode.node`. These functions move losslessly
 * between that shape and the versioned JSON contract:
 *
 *   schemaToTree / fieldToTree  — load: strip child arrays into `children`,
 *                                 stamp fresh uids, recurse.
 *   treeToSchema / treeToField  — save: reattach children under the right key
 *                                 (`array` ALWAYS emits `itemFields`, even []),
 *                                 omit undefined optionals.
 *
 * The transformer NEVER renames or invents props, so `treeToSchema(schemaToTree(x))`
 * is a deep-equal round trip (uid generation lives here + in `clone`; name
 * uniqueness only in `clone`/paste/`newField`).
 * ------------------------------------------------------------------------- */

/** Drop a node's child array (structure lives in TreeNode.children), keeping every
 *  other prop untouched. Leaves have no child key and pass through. */
function stripChildren(field: FieldNode): FieldProps {
  const key = childrenKeyOf(field.type);
  if (!key) return field as FieldProps;
  const { [key]: _omit, ...rest } = field as Record<string, unknown>;
  return rest as unknown as FieldProps;
}

/** One schema field (and its subtree) → a TreeNode with fresh uids. */
export function fieldToTree(field: FieldNode): TreeNode {
  const kids = childrenOf(field) ?? [];
  return { uid: makeUid(), node: stripChildren(field), children: kids.map(fieldToTree) };
}

/** A whole form → the designer tree whose root is the form node. */
export function schemaToTree(form: FormSchema): TreeNode {
  const node: FormProps = { type: "form", id: form.id, title: form.title };
  if (form.layoutProps !== undefined) node.layoutProps = form.layoutProps;
  if (form.settings !== undefined) node.settings = form.settings;
  return { uid: makeUid(), node, children: form.fields.map(fieldToTree) };
}

/** A TreeNode (never the form root) → its schema field, reattaching children. */
export function treeToField(node: TreeNode): FieldNode {
  const props = node.node;
  if (props.type === "form") {
    throw new Error("treeToField: the form root is not a field — use treeToSchema");
  }
  const key = childrenKeyOf(props.type);
  if (!key) return { ...props } as FieldNode;
  // Containers emit `children`; `array` emits `itemFields` even when empty.
  return { ...props, [key]: node.children.map(treeToField) } as FieldNode;
}

/** The designer tree → the versioned JSON contract (always at current version). */
export function treeToSchema(root: TreeNode): FormSchema {
  const props = root.node;
  if (props.type !== "form") {
    throw new Error("treeToSchema: root is not a form node");
  }
  const form: FormSchema = {
    formVersion: CURRENT_FORM_VERSION,
    id: props.id,
    title: props.title,
    fields: root.children.map(treeToField),
  };
  if (props.layoutProps !== undefined) form.layoutProps = props.layoutProps;
  if (props.settings !== undefined) form.settings = props.settings;
  return form;
}

/** Replace the subtree at `uid` with the one built from `field`, KEEPING the
 *  target's uid (the PropertyPanel edit boundary). Returns the same root when the
 *  uid is absent. Descendant uids are regenerated — fine while only top-level
 *  nodes are selectable; Phase E switches the settings panel to `patchNode` edits. */
export function replaceField(root: TreeNode, uid: string, field: FieldNode): TreeNode {
  if (!findNode(root, uid)) return root;
  const subtree = fieldToTree(field);
  return replaceAt(root, uid, () => ({ ...subtree, uid }));
}

/** Apply a PropertyPanel edit. A layout container patches its OWN props only — its
 *  children subtree (and every descendant uid) stays put, so a selected/nested node
 *  isn't orphaned (the container is now selectable; `replaceField` would regenerate
 *  descendant uids). Leaf/array nodes have no selectable descendants, so they are
 *  swapped wholesale via `replaceField`. */
export function applyFieldEdit(root: TreeNode, uid: string, field: FieldNode): TreeNode {
  if (isLayoutContainer(field)) {
    // patchNode is a shallow merge: it adds/overwrites the container's own props but
    // can't clear an optional one. Fine today — the panel's `set` only ever sets keys.
    const key = childrenKeyOf(field.type);
    const { [key as string]: _children, ...own } = field as unknown as Record<string, unknown>;
    return patchNode(root, uid, own as Partial<EngineProps>);
  }
  return replaceField(root, uid, field);
}
