import type { ArrayField, FieldNode, LeafField } from "@org/form-schema";

/** The leaf/array nodes the full field editor handles. Layout containers render a
 *  minimal settings-only editor instead (they are nameless / value-transparent). */
export type AuthoredField = LeafField | ArrayField;

/** The PropertyPanel's selected node: a uid plus the resolved schema field. */
export interface SelectedNode {
  uid: string;
  field: FieldNode;
}

/** A breakpoint colSpan; antd Col span is 1..24. */
export type ColKey = "xs" | "sm" | "md" | "lg";
export const COL_KEYS: ColKey[] = ["xs", "sm", "md", "lg"];

export type Patch = Partial<AuthoredField>;
