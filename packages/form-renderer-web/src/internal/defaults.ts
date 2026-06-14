import { childrenOf, type FieldNode, isLayoutContainer } from "@org/form-schema";
import type { Values } from "./control-types.js";

/** Collect per-field `defaultValue`s declared in the schema. Explicit
 *  `initialValues` (e.g. an existing submission) always win over these. */
export function schemaDefaults(nodes: FieldNode[], into: Values = {}): Values {
  for (const node of nodes) {
    if (isLayoutContainer(node)) {
      schemaDefaults(node.children, into);
    } else if (node.type === "array") {
      // Seed an empty list so useFieldArray stays controlled; row defaults are
      // applied per-row on append, not here.
      into[node.name] = [];
    } else if (node.defaultValue !== undefined) {
      into[node.name] = node.defaultValue;
    } else if (
      node.type === "checkbox-group" ||
      node.type === "upload" ||
      node.type === "cascader" ||
      (node.type === "tree-select" && node.multiple)
    ) {
      // Array-valued leaves seed [] so the control stays controlled and a `required`
      // rule surfaces its custom "is required" message (min(1) on an empty array,
      // rather than an "expected array" type error on undefined).
      into[node.name] = [];
    }
  }
  return into;
}

/** True when any node in the tree (at any depth) is of `type`. Used to hide the global
 *  Submit row when a `steps` wizard owns submission. */
export function containsType(nodes: FieldNode[], type: FieldNode["type"]): boolean {
  for (const node of nodes) {
    if (node.type === type) return true;
    const kids = childrenOf(node);
    if (kids && containsType(kids, type)) return true;
  }
  return false;
}

/** Top-level value-scope field names reachable inside a step pane — the names a per-step
 *  `trigger()` validates. Value-transparent containers (group/tabs/…) are descended; an
 *  array contributes its own name (triggering it validates the whole list) and its row
 *  fields are not walked (they live under dotted `array.{i}.{child}` paths). */
export function collectStepNames(nodes: FieldNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (isLayoutContainer(node)) collectStepNames(node.children, into);
    else if ("name" in node && node.name) into.push(node.name);
  }
  return into;
}
