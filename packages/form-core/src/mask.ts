import { type FieldNode, type FormSchema, isLayoutContainer } from "@org/form-schema";
import { type AccessContext, canView } from "./rbac.js";

/** Remove `node`'s value from `scope`. Layout containers are transparent (their children live in
 *  the same flat scope), so deleting one deletes every descendant leaf. Display nodes hold no value. */
function deleteNode(node: FieldNode, scope: Record<string, unknown>): void {
  if (isLayoutContainer(node)) {
    for (const child of node.children) deleteNode(child, scope);
    return;
  }
  if (node.type === "display-text") return;
  delete scope[node.name];
}

/** Mask, IN PLACE, the fields in `scope` the actor cannot VIEW. Mirrors `buildZodSchema`'s
 *  traversal: layout containers flatten into the parent scope, array rows are masked per-row. */
function maskNodes(
  nodes: FieldNode[],
  scope: Record<string, unknown>,
  access: AccessContext,
): void {
  for (const node of nodes) {
    if (!canView(node, access)) {
      deleteNode(node, scope);
      continue;
    }
    if (isLayoutContainer(node)) {
      maskNodes(node.children, scope, access); // transparent container: children share this scope
      continue;
    }
    if (node.type === "array") {
      const rows = scope[node.name];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (row && typeof row === "object") {
          maskNodes(node.itemFields, row as Record<string, unknown>, access);
        }
      }
    }
    // leaf (or display-text): viewable → keep as-is
  }
}

/**
 * Return a deep copy of `data` with every field the actor cannot VIEW removed (field-level RBAC,
 * `permissions.viewRoles`). Used server-side so reads never leak role-gated answers regardless of
 * the client. Transparent layout containers flatten (children share the parent scope) and array
 * rows are masked per-row, mirroring `buildZodSchema`'s traversal — so the same fields that are
 * excluded from the validation shape are the ones masked here. Empty/undefined `viewRoles` on a
 * node ⇒ visible to everyone; only nodes gated to roles the actor lacks are dropped. Pure: never
 * mutates `data`.
 */
export function maskData(
  form: FormSchema,
  data: Record<string, unknown>,
  access: AccessContext,
): Record<string, unknown> {
  const copy = structuredClone(data);
  maskNodes(form.fields, copy, access);
  return copy;
}
