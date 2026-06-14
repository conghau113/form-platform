import type { InsertGuard, TreeNode } from "../engine/tree";
import { BY_TYPE, FIELD_REGISTRY } from "./registry";
import type { ComponentMeta, FieldDescriptor, FieldType, NodeType } from "./types";

/** Look up the meta for any node type, including the root `form`. Throws if unknown. */
export function describeNode(type: NodeType): ComponentMeta {
  const m = BY_TYPE.get(type);
  if (!m) throw new Error(`Unknown node type: ${type}`);
  return m;
}

export function describeField(type: FieldType): FieldDescriptor {
  return describeNode(type);
}

// FIELD_REGISTRY holds only FieldNode types (the root `form` lives in FORM_META), so a
// registry entry's `type` is always a FieldType — narrow it here for the public lists.
/** All FieldNode types known to the registry (palette + containers). */
export const FIELD_TYPES: FieldType[] = FIELD_REGISTRY.map((d) => d.type as FieldType);

/** The subset of field types the palette offers (drag sources). */
export const PALETTE_TYPES: FieldType[] = FIELD_REGISTRY.filter((d) => d.showInPalette).map(
  (d) => d.type as FieldType,
);

export function fieldTypeLabel(type: NodeType): string {
  return BY_TYPE.get(type)?.label ?? type;
}

/** Palette entries grouped by category, preserving registry order. Only palette-visible
 *  types are included, so containers stay hidden until Phase E. */
export function fieldsByCategory(): Array<{ category: string; items: FieldDescriptor[] }> {
  const groups: Array<{ category: string; items: FieldDescriptor[] }> = [];
  for (const d of FIELD_REGISTRY) {
    if (!d.showInPalette) continue;
    let g = groups.find((x) => x.category === d.category);
    if (!g) {
      g = { category: d.category, items: [] };
      groups.push(g);
    }
    g.items.push(d);
  }
  return groups;
}

/** Central insert guard: may a `childType` node be placed directly inside `parentType`?
 *  Enforces (1) the form root can never be inserted, (2) the parent must be droppable,
 *  (3) a parent's `allowAppend` restriction (e.g. tabs only accept panes), and (4) a
 *  child's `allowParents` restriction (e.g. a pane only lives under tabs). */
export function canInsert(parentType: NodeType, childType: NodeType): boolean {
  if (childType === "form") return false;
  const parent = describeNode(parentType);
  if (!parent.behavior.droppable) return false;
  if (parent.behavior.allowAppend && !parent.behavior.allowAppend(parentType, childType)) {
    return false;
  }
  const child = describeNode(childType);
  if (child.behavior.allowParents && !child.behavior.allowParents.includes(parentType)) {
    return false;
  }
  return true;
}

/** The {@link InsertGuard} the builder passes to tree-engine ops — `canInsert` lifted to
 *  operate on TreeNodes by reading each node's type. */
export function metaGuard(): InsertGuard {
  return (parent: TreeNode, child: TreeNode) => canInsert(parent.node.type, child.node.type);
}
