import type {
  CardField,
  CollapseField,
  CollapsePanelField,
  FieldNode,
  FormLayoutField,
  GridField,
  GroupField,
  SpaceField,
  StepField,
  StepsField,
  TabPaneField,
  TabsField,
} from "./schema.js";

/** Value-TRANSPARENT containers: their children's values hoist to the parent
 *  object. `array` is deliberately NOT one — it nests values under its name. */
export type LayoutContainerField =
  | GroupField
  | TabsField
  | TabPaneField
  | CollapseField
  | CollapsePanelField
  | CardField
  | GridField
  | SpaceField
  | StepsField
  | StepField
  | FormLayoutField;

export const LAYOUT_CONTAINER_TYPES = [
  "group",
  "tabs",
  "tab-pane",
  "collapse",
  "collapse-panel",
  "card",
  "grid",
  "space",
  "steps",
  "step",
  "form-layout",
] as const;

const containerTypes: ReadonlySet<string> = new Set(LAYOUT_CONTAINER_TYPES);

export function isLayoutContainer(node: FieldNode): node is LayoutContainerField {
  return containerTypes.has(node.type);
}

/** The child list of any node: containers -> children, array -> itemFields,
 *  leaves -> null. Single walk helper so consumers never grow type switches. */
export function childrenOf(node: FieldNode): FieldNode[] | null {
  if (isLayoutContainer(node)) return node.children;
  if (node.type === "array") return node.itemFields;
  return null;
}

/** Which key a node type stores its children under (drives tree<->schema
 *  transformers in authoring tools). */
export function childrenKeyOf(type: FieldNode["type"]): "children" | "itemFields" | null {
  if (containerTypes.has(type)) return "children";
  if (type === "array") return "itemFields";
  return null;
}
