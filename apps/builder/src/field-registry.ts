import type { FieldNode, ValidationRule } from "@org/form-schema";
import type { InsertGuard, TreeNode } from "./engine/tree";

/**
 * Meta-driven component registry (v2) — the single source of truth the builder uses
 * to author every node. Each entry declares how a type appears in the palette, how a
 * fresh node is seeded, which type-specific settings the property panel shows, how its
 * default value is edited, AND its designer BEHAVIOR (drag/drop/clone/delete + which
 * children it accepts). Palette, model factories, the property panel and the tree-engine
 * insert guard all derive from this list instead of hard-coding per-type branches — the
 * same idea as Formily/Designable's component registry (`createBehavior`/`createResource`),
 * kept on top of our Zod contract rather than replacing it.
 */

/** Every FieldNode type the contract knows (leaves + array + containers). */
export type FieldType = FieldNode["type"];
/** A node type the designer tree can hold, including the root `form` node. */
export type NodeType = FieldType | "form";

/** A control kind the property panel knows how to render for a setting. */
export type SettingControl = "text" | "number" | "checkbox" | "options" | "select";

/** One choice for a `select` setting control. */
export interface SettingChoice {
  label: string;
  value: string;
}

/** One type-specific setting, e.g. a select's `options` or a grid's `cols`. */
export interface SettingDescriptor {
  /** Property key on the node this setting reads/writes. */
  key: string;
  label: string;
  control: SettingControl;
  /** Choices for `control: "select"`. */
  choices?: SettingChoice[];
}

/** How the shared "Default value" editor renders for this type. */
export type DefaultValueKind = "text" | "number" | "boolean" | "none";

/** A validation rule kind, mirrored from the schema contract. */
export type ValidationRuleType = ValidationRule["type"];

/** Rule kinds offered for text-like inputs (string length, regex, named formats). */
export const STRING_RULES: ValidationRuleType[] = [
  "required",
  "len",
  "min",
  "max",
  "pattern",
  "format",
];
/** Rule kinds offered for numeric inputs. */
export const NUMBER_RULES: ValidationRuleType[] = ["required", "min", "max"];

/** Designer interaction rules for a node type (mirrors Designable's behavior flags). */
export interface ComponentBehavior {
  /** Can other nodes be dropped INTO this node (it has a children slot)? */
  droppable: boolean;
  /** Can this node itself be dragged on the canvas? */
  draggable: boolean;
  /** Can this node be copy/pasted? */
  cloneable: boolean;
  /** Can this node be deleted? (the root `form` cannot). */
  deletable: boolean;
  /** When set, restricts which child types this node accepts (e.g. tabs ⇒ tab-pane). */
  allowAppend?: (parentType: NodeType, childType: NodeType) => boolean;
  /** When set, this node may only be inserted under one of these parent types
   *  (e.g. tab-pane ⇒ ["tabs"]). */
  allowParents?: NodeType[];
}

export interface FieldDescriptor {
  type: NodeType;
  label: string;
  /** Palette grouping header. */
  category: string;
  /** Extra props (beyond type/name/label) a freshly dropped node starts with. */
  defaults: Record<string, unknown>;
  /** Type-specific settings rendered in the property panel. */
  settings: SettingDescriptor[];
  defaultValueKind: DefaultValueKind;
  /** Validation rule kinds the panel offers for this type. Omitted/empty hides the
   *  Validation section (the type has no meaningful field-level rules to add). */
  validations?: ValidationRuleType[];
}

/** A full component meta: a {@link FieldDescriptor} plus designer behavior. */
export interface ComponentMeta extends FieldDescriptor {
  behavior: ComponentBehavior;
  /** Optional palette/outline icon (emoji or glyph). */
  icon?: string;
  /** Whether the palette offers this type. Containers stay false until Phase E. */
  showInPalette: boolean;
  /** Whether the node carries a schema `name` (value-bearing). Containers are nameless. */
  named: boolean;
}

const placeholder: SettingDescriptor = {
  key: "placeholder",
  label: "Placeholder",
  control: "text",
};
const maxLength: SettingDescriptor = { key: "maxLength", label: "Max length", control: "number" };
const optionsSetting: SettingDescriptor = { key: "options", label: "Options", control: "options" };

/** A value-bearing leaf input: draggable, not droppable. */
const LEAF: ComponentBehavior = {
  droppable: false,
  draggable: true,
  cloneable: true,
  deletable: true,
};
/** A generic container: holds any non-pane child, fully drag/clone/deletable. */
const CONTAINER: ComponentBehavior = {
  droppable: true,
  draggable: true,
  cloneable: true,
  deletable: true,
};

/** Layout-prop settings for the root Form node (Phase F SettingsPanel renders these). */
const FORM_SETTINGS: SettingDescriptor[] = [
  {
    key: "layout",
    label: "Layout",
    control: "select",
    choices: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
      { label: "Inline", value: "inline" },
    ],
  },
  {
    key: "size",
    label: "Size",
    control: "select",
    choices: [
      { label: "Small", value: "small" },
      { label: "Middle", value: "middle" },
      { label: "Large", value: "large" },
    ],
  },
  {
    key: "labelAlign",
    label: "Label align",
    control: "select",
    choices: [
      { label: "Right", value: "right" },
      { label: "Left", value: "left" },
    ],
  },
  { key: "colon", label: "Show colon", control: "checkbox" },
  { key: "labelWrap", label: "Wrap labels", control: "checkbox" },
];

/** Ordered registry of FieldNode types. Palette renders the `showInPalette` subset of
 *  this list, grouped by `category` and in this order. */
export const FIELD_REGISTRY: ComponentMeta[] = [
  {
    type: "text",
    label: "Text",
    category: "Input",
    defaults: {},
    settings: [placeholder, maxLength],
    defaultValueKind: "text",
    validations: STRING_RULES,
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "textarea",
    label: "Textarea",
    category: "Input",
    defaults: {},
    settings: [placeholder, maxLength, { key: "rows", label: "Rows", control: "number" }],
    defaultValueKind: "text",
    validations: STRING_RULES,
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "password",
    label: "Password",
    category: "Input",
    defaults: {},
    settings: [placeholder, maxLength],
    defaultValueKind: "none",
    validations: STRING_RULES,
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "number",
    label: "Number",
    category: "Input",
    defaults: {},
    settings: [
      { key: "min", label: "Min", control: "number" },
      { key: "max", label: "Max", control: "number" },
    ],
    defaultValueKind: "number",
    validations: NUMBER_RULES,
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "select",
    label: "Select",
    category: "Choice",
    defaults: { options: [] },
    // Options/dataSource are authored by the bespoke DataSourceEditor (static vs remote),
    // not the generic `options` descriptor — only `multiple` is descriptor-driven here.
    settings: [{ key: "multiple", label: "Allow multiple", control: "checkbox" }],
    defaultValueKind: "text",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "radio",
    label: "Radio",
    category: "Choice",
    defaults: { options: [] },
    settings: [optionsSetting],
    defaultValueKind: "text",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "checkbox",
    label: "Checkbox",
    category: "Boolean",
    defaults: {},
    settings: [],
    defaultValueKind: "boolean",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "switch",
    label: "Switch",
    category: "Boolean",
    defaults: {},
    settings: [],
    defaultValueKind: "boolean",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "slider",
    label: "Slider",
    category: "Number",
    defaults: {},
    settings: [
      { key: "min", label: "Min", control: "number" },
      { key: "max", label: "Max", control: "number" },
      { key: "step", label: "Step", control: "number" },
    ],
    defaultValueKind: "number",
    validations: NUMBER_RULES,
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "rate",
    label: "Rate",
    category: "Number",
    defaults: {},
    settings: [
      { key: "count", label: "Star count", control: "number" },
      { key: "allowHalf", label: "Allow half", control: "checkbox" },
    ],
    defaultValueKind: "number",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "date",
    label: "Date",
    category: "Date & time",
    defaults: {},
    settings: [],
    defaultValueKind: "none",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "time",
    label: "Time",
    category: "Date & time",
    defaults: {},
    settings: [],
    defaultValueKind: "none",
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "color",
    label: "Color",
    category: "Advanced",
    defaults: {},
    settings: [],
    defaultValueKind: "text",
    validations: STRING_RULES,
    behavior: LEAF,
    showInPalette: true,
    named: true,
  },
  {
    type: "array",
    label: "Array (list)",
    category: "Layout",
    // A fresh Form List starts with no item fields; they're authored in the
    // PropertyPanel's Item fields editor. minItems/maxItems render via the
    // generic number settings below.
    defaults: { itemFields: [] },
    settings: [
      { key: "minItems", label: "Min items", control: "number" },
      { key: "maxItems", label: "Max items", control: "number" },
    ],
    defaultValueKind: "none",
    // An array nests values per row; it IS droppable (item fields are its children).
    behavior: CONTAINER,
    showInPalette: true,
    named: true,
  },
  // --- Layout containers (value-transparent, nameless) ----------------------
  // Out of the palette until Phase E (showInPalette: false); present here so the
  // tree engine, transformer and settings panel have full metadata for them.
  {
    type: "group",
    label: "Group",
    category: "Layout",
    defaults: { children: [] },
    settings: [],
    defaultValueKind: "none",
    behavior: CONTAINER,
    showInPalette: false,
    named: true,
  },
  {
    type: "tabs",
    label: "Tabs",
    category: "Layout",
    defaults: { children: [] },
    settings: [],
    defaultValueKind: "none",
    behavior: { ...CONTAINER, allowAppend: (_p, c) => c === "tab-pane" },
    showInPalette: false,
    named: false,
  },
  {
    type: "tab-pane",
    label: "Tab",
    category: "Layout",
    defaults: { label: "Tab", children: [] },
    settings: [{ key: "label", label: "Tab label", control: "text" }],
    defaultValueKind: "none",
    behavior: { ...CONTAINER, allowParents: ["tabs"] },
    showInPalette: false,
    named: false,
  },
  {
    type: "collapse",
    label: "Collapse",
    category: "Layout",
    defaults: { children: [] },
    settings: [{ key: "accordion", label: "Accordion (one open)", control: "checkbox" }],
    defaultValueKind: "none",
    behavior: { ...CONTAINER, allowAppend: (_p, c) => c === "collapse-panel" },
    showInPalette: false,
    named: false,
  },
  {
    type: "collapse-panel",
    label: "Panel",
    category: "Layout",
    defaults: { label: "Section", children: [] },
    settings: [{ key: "label", label: "Panel label", control: "text" }],
    defaultValueKind: "none",
    behavior: { ...CONTAINER, allowParents: ["collapse"] },
    showInPalette: false,
    named: false,
  },
  {
    type: "card",
    label: "Card",
    category: "Layout",
    defaults: { children: [] },
    settings: [{ key: "title", label: "Title", control: "text" }],
    defaultValueKind: "none",
    behavior: CONTAINER,
    showInPalette: false,
    named: false,
  },
  {
    type: "grid",
    label: "Grid",
    category: "Layout",
    defaults: { cols: 2, children: [] },
    settings: [{ key: "cols", label: "Columns", control: "number" }],
    defaultValueKind: "none",
    behavior: CONTAINER,
    showInPalette: false,
    named: false,
  },
  {
    type: "space",
    label: "Space",
    category: "Layout",
    defaults: { children: [] },
    settings: [
      {
        key: "direction",
        label: "Direction",
        control: "select",
        choices: [
          { label: "Horizontal", value: "horizontal" },
          { label: "Vertical", value: "vertical" },
        ],
      },
    ],
    defaultValueKind: "none",
    behavior: CONTAINER,
    showInPalette: false,
    named: false,
  },
];

/** The root Form node's meta. It is never in the palette and never seeded by `newField`
 *  (the tree always has exactly one form root); droppable but never drag/clone/deletable. */
export const FORM_META: ComponentMeta = {
  type: "form",
  label: "Form",
  category: "Form",
  defaults: {},
  settings: FORM_SETTINGS,
  defaultValueKind: "none",
  behavior: { droppable: true, draggable: false, cloneable: false, deletable: false },
  showInPalette: false,
  named: false,
};

const BY_TYPE = new Map<NodeType, ComponentMeta>(
  [...FIELD_REGISTRY, FORM_META].map((m) => [m.type, m]),
);

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

/** A schema `name` unique within the model, numbered from the type (text1, text2, …). */
function seedName(type: FieldType, taken: ReadonlySet<string>): string {
  let i = 1;
  let name = `${type}${i}`;
  while (taken.has(name)) {
    i += 1;
    name = `${type}${i}`;
  }
  return name;
}

/** Build a valid, minimal node of the given type. Seed props come from the registry
 *  meta, so adding a type needs no edit here. Named types (leaves + array + group) get a
 *  unique `name` and the registry label; nameless containers seed `children: []` only.
 *  The cast trusts the meta's `defaults`; field-registry.test.ts guards it by parsing
 *  every seeded node against the contract. */
export function newField(type: FieldType, taken: ReadonlySet<string> = new Set()): FieldNode {
  const meta = describeNode(type);
  const seed: Record<string, unknown> = { type, ...meta.defaults };
  if (meta.named) {
    seed.name = seedName(type, taken);
    seed.label = meta.label;
  }
  return seed as FieldNode;
}
