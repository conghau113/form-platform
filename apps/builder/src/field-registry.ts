import type { LeafField, ValidationRule } from "@org/form-schema";

/**
 * Meta-driven field registry — the single source of truth the builder uses to
 * author leaf fields. Each entry declares how a type appears in the palette, how
 * a fresh field is seeded, which type-specific settings the property panel shows,
 * and how its default value is edited. Palette, model factories and the property
 * panel all derive from this list instead of hard-coding per-type branches — the
 * same idea as Formily/Designable's component registry, kept on top of our Zod
 * contract rather than replacing it.
 */

/** Authorable node types: every leaf type plus the `array` (Form List) container.
 *  `group` is still excluded from visual authoring (Phase D's nested canvas). */
export type FieldType = LeafField["type"] | "array";

/** A control kind the property panel knows how to render for a setting. */
export type SettingControl = "text" | "number" | "checkbox" | "options";

/** One type-specific setting, e.g. a select's `options` or a number's `min`. */
export interface SettingDescriptor {
  /** Property key on the leaf field this setting reads/writes. */
  key: string;
  label: string;
  control: SettingControl;
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

export interface FieldDescriptor {
  type: FieldType;
  label: string;
  /** Palette grouping header. */
  category: string;
  /** Extra props (beyond type/name/label) a freshly dropped field starts with. */
  defaults: Record<string, unknown>;
  /** Type-specific settings rendered in the property panel. */
  settings: SettingDescriptor[];
  defaultValueKind: DefaultValueKind;
  /** Validation rule kinds the panel offers for this type. Omitted/empty hides the
   *  Validation section (the field has no meaningful field-level rules to add). */
  validations?: ValidationRuleType[];
}

const placeholder: SettingDescriptor = {
  key: "placeholder",
  label: "Placeholder",
  control: "text",
};
const maxLength: SettingDescriptor = { key: "maxLength", label: "Max length", control: "number" };
const optionsSetting: SettingDescriptor = { key: "options", label: "Options", control: "options" };

/** Ordered registry. Palette renders in this order, grouped by `category`. */
export const FIELD_REGISTRY: FieldDescriptor[] = [
  {
    type: "text",
    label: "Text",
    category: "Input",
    defaults: {},
    settings: [placeholder, maxLength],
    defaultValueKind: "text",
    validations: STRING_RULES,
  },
  {
    type: "textarea",
    label: "Textarea",
    category: "Input",
    defaults: {},
    settings: [placeholder, maxLength, { key: "rows", label: "Rows", control: "number" }],
    defaultValueKind: "text",
    validations: STRING_RULES,
  },
  {
    type: "password",
    label: "Password",
    category: "Input",
    defaults: {},
    settings: [placeholder, maxLength],
    defaultValueKind: "none",
    validations: STRING_RULES,
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
  },
  {
    type: "select",
    label: "Select",
    category: "Choice",
    defaults: { options: [] },
    settings: [{ key: "multiple", label: "Allow multiple", control: "checkbox" }, optionsSetting],
    defaultValueKind: "text",
  },
  {
    type: "radio",
    label: "Radio",
    category: "Choice",
    defaults: { options: [] },
    settings: [optionsSetting],
    defaultValueKind: "text",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    category: "Boolean",
    defaults: {},
    settings: [],
    defaultValueKind: "boolean",
  },
  {
    type: "switch",
    label: "Switch",
    category: "Boolean",
    defaults: {},
    settings: [],
    defaultValueKind: "boolean",
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
  },
  {
    type: "date",
    label: "Date",
    category: "Date & time",
    defaults: {},
    settings: [],
    defaultValueKind: "none",
  },
  {
    type: "time",
    label: "Time",
    category: "Date & time",
    defaults: {},
    settings: [],
    defaultValueKind: "none",
  },
  {
    type: "color",
    label: "Color",
    category: "Advanced",
    defaults: {},
    settings: [],
    defaultValueKind: "text",
    validations: STRING_RULES,
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
  },
];

const BY_TYPE = new Map(FIELD_REGISTRY.map((d) => [d.type, d]));

export function describeField(type: FieldType): FieldDescriptor {
  const d = BY_TYPE.get(type);
  if (!d) throw new Error(`Unknown field type: ${type}`);
  return d;
}

/** Palette order, derived from the registry. */
export const FIELD_TYPES: FieldType[] = FIELD_REGISTRY.map((d) => d.type);

export function fieldTypeLabel(type: FieldType): string {
  return BY_TYPE.get(type)?.label ?? type;
}

/** Registry entries grouped by palette category, preserving registry order. */
export function fieldsByCategory(): Array<{ category: string; items: FieldDescriptor[] }> {
  const groups: Array<{ category: string; items: FieldDescriptor[] }> = [];
  for (const d of FIELD_REGISTRY) {
    let g = groups.find((x) => x.category === d.category);
    if (!g) {
      g = { category: d.category, items: [] };
      groups.push(g);
    }
    g.items.push(d);
  }
  return groups;
}
