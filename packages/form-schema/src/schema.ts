import { z } from "zod";

/**
 * The CURRENT schema format version.
 * IMPORTANT: this is independent of the npm package version.
 * Bump this ONLY when the JSON data shape changes (rare), and add a
 * migration in migrate.ts. The package version changes on every code release.
 */
export const CURRENT_FORM_VERSION = 3 as const;

export const colSpanSchema = z.object({
  xs: z.number().int().min(1).max(24).optional(),
  sm: z.number().int().min(1).max(24).optional(),
  md: z.number().int().min(1).max(24).optional(),
  lg: z.number().int().min(1).max(24).optional(),
});

/** Layout is described semantically. Web reads colSpan; native ignores it
 *  and honors only hideOnMobile / mobileOrder. */
export const layoutSchema = z.object({
  colSpan: colSpanSchema.optional(),
  hideOnMobile: z.boolean().optional(),
  mobileOrder: z.number().int().optional(),
});

/** Conditional visibility. The `rule` is a JSONLogic expression evaluated by a
 *  SAFE evaluator in form-core. NEVER eval() these rules. */
export const conditionSchema = z.object({
  rule: z.record(z.string(), z.any()),
});

/** A reaction (a.k.a. linkage) makes one field react to others' values. While
 *  `when` (SAFE JSONLogic, same shape/evaluator as `visibleWhen`) is true, the
 *  named `target` gets `effect` applied:
 *  - `visible`  → show/hide (payload boolean, defaults true; false = hide-when-matched)
 *  - `disabled` → toggle interactivity (payload boolean)
 *  - `value`    → set the target's value to `value` (target becomes controlled while matched)
 *  - `options`  → replace a select/radio's options with `value` (array of {label,value})
 *  Evaluated by form-core's reactions engine. NEVER eval() these rules. */
export const reactionEffectSchema = z.enum(["visible", "disabled", "value", "options"]);
export const reactionSchema = z.object({
  when: conditionSchema,
  target: z.string().min(1),
  effect: reactionEffectSchema,
  value: z.any().optional(),
});
export type Reaction = z.infer<typeof reactionSchema>;
export type ReactionEffect = z.infer<typeof reactionEffectSchema>;

export const permissionSchema = z.object({
  viewRoles: z.array(z.string()).optional(),
  editRoles: z.array(z.string()).optional(),
});

/** A single field validation rule. Translated to Zod by form-core's buildZodSchema.
 *  - `len`/`min`/`max`: numeric `value` (string length or numeric bound by field type).
 *  - `pattern`: `value` is a regex SOURCE string — compiled via `new RegExp`, NEVER eval.
 *  - `format`: a named check selected by `format` (email | url | phone).
 *  - `required`: presence; equivalent to the `required` flag, kept here for a custom message.
 *  `message` overrides the default error text when the rule fails. */
export const validationRuleSchema = z.object({
  type: z.enum(["required", "len", "min", "max", "pattern", "format"]),
  value: z.union([z.string(), z.number()]).optional(),
  format: z.enum(["email", "url", "phone"]).optional(),
  message: z.string().optional(),
});

export type ValidationRule = z.infer<typeof validationRuleSchema>;

/** antd-style column geometry for label/control alignment (horizontal layouts). */
const formColSchema = z.object({
  span: z.number().int().min(0).max(24).optional(),
  offset: z.number().int().min(0).max(24).optional(),
});

/** Form-level layout, mirrored from antd `Form` (Designable's root Form
 *  defaultProps are labelCol 6 / wrapperCol 12). All optional → additive. */
export const formLayoutPropsSchema = z.object({
  layout: z.enum(["horizontal", "vertical", "inline"]).optional(),
  labelCol: formColSchema.optional(),
  wrapperCol: formColSchema.optional(),
  size: z.enum(["small", "middle", "large"]).optional(),
  colon: z.boolean().optional(),
  labelAlign: z.enum(["left", "right"]).optional(),
  labelWrap: z.boolean().optional(),
});

export type FormLayoutProps = z.infer<typeof formLayoutPropsSchema>;

/** Per-field overrides of the form-level decorator (antd `Form.Item`) props. */
export const decoratorPropsSchema = z.object({
  labelCol: formColSchema.optional(),
  wrapperCol: formColSchema.optional(),
  colon: z.boolean().optional(),
  labelAlign: z.enum(["left", "right"]).optional(),
});

export type DecoratorProps = z.infer<typeof decoratorPropsSchema>;

const commonFields = {
  name: z.string().min(1),
  label: z.string(),
  helpText: z.string().optional(),
  /** Short hint rendered as an info tooltip next to the label. */
  tooltip: z.string().optional(),
  required: z.boolean().optional(),
  /** Render the control read-only / non-interactive. */
  disabled: z.boolean().optional(),
  /** Seed value applied when a fresh form is rendered with no initialValues. */
  defaultValue: z.any().optional(),
  /** Field-level validation rules, compiled to Zod by form-core. Additive: old
   *  JSON without this key keeps parsing, so no formVersion bump is required. */
  validations: z.array(validationRuleSchema).optional(),
  layout: layoutSchema.optional(),
  /** Per-field Form.Item overrides of the root `layoutProps` (labelCol etc.). */
  decoratorProps: decoratorPropsSchema.optional(),
  visibleWhen: conditionSchema.optional(),
  /** Linkage rules driven by other fields' values. Additive: old JSON without
   *  this key keeps parsing, so no formVersion bump is required. */
  reactions: z.array(reactionSchema).optional(),
  permissions: permissionSchema.optional(),
};

export const textFieldSchema = z.object({
  type: z.literal("text"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
});

export const textareaFieldSchema = z.object({
  type: z.literal("textarea"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
  rows: z.number().int().optional(),
});

export const numberFieldSchema = z.object({
  type: z.literal("number"),
  ...commonFields,
  min: z.number().optional(),
  max: z.number().optional(),
});

export const optionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

export const selectFieldSchema = z.object({
  type: z.literal("select"),
  ...commonFields,
  multiple: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  dataSource: z
    .object({
      url: z.string(),
      labelKey: z.string(),
      valueKey: z.string(),
      dependsOn: z.string().optional(),
    })
    .optional(),
});

export const dateFieldSchema = z.object({ type: z.literal("date"), ...commonFields });
export const timeFieldSchema = z.object({ type: z.literal("time"), ...commonFields });
export const checkboxFieldSchema = z.object({ type: z.literal("checkbox"), ...commonFields });
export const switchFieldSchema = z.object({ type: z.literal("switch"), ...commonFields });

/** Single choice rendered as a radio group. Shares the option/dataSource shape
 *  with select so authoring tooling can reuse it. */
export const radioFieldSchema = z.object({
  type: z.literal("radio"),
  ...commonFields,
  options: z.array(optionSchema).optional(),
});

export const passwordFieldSchema = z.object({
  type: z.literal("password"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
});

export const sliderFieldSchema = z.object({
  type: z.literal("slider"),
  ...commonFields,
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
});

export const rateFieldSchema = z.object({
  type: z.literal("rate"),
  ...commonFields,
  /** Number of stars; defaults to 5 in the renderer. */
  count: z.number().int().optional(),
  allowHalf: z.boolean().optional(),
});

export const colorFieldSchema = z.object({ type: z.literal("color"), ...commonFields });

export type LeafField =
  | z.infer<typeof textFieldSchema>
  | z.infer<typeof textareaFieldSchema>
  | z.infer<typeof numberFieldSchema>
  | z.infer<typeof selectFieldSchema>
  | z.infer<typeof radioFieldSchema>
  | z.infer<typeof dateFieldSchema>
  | z.infer<typeof timeFieldSchema>
  | z.infer<typeof checkboxFieldSchema>
  | z.infer<typeof switchFieldSchema>
  | z.infer<typeof passwordFieldSchema>
  | z.infer<typeof sliderFieldSchema>
  | z.infer<typeof rateFieldSchema>
  | z.infer<typeof colorFieldSchema>;

export interface GroupField {
  type: "group";
  name: string;
  label?: string;
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

/** A repeatable list of fields (a.k.a. Form List). Its value is an array of row
 *  objects keyed by the item fields' names: `name: [{...}, {...}]`. `itemFields` is
 *  recursive like `group.children`, so rows can contain any node (including nested
 *  arrays/groups). Presence/length is bounded by `required` (≥1) / minItems / maxItems. */
export interface ArrayField {
  type: "array";
  name: string;
  label?: string;
  helpText?: string;
  tooltip?: string;
  required?: boolean;
  minItems?: number;
  maxItems?: number;
  /** How the renderer lays out the rows. Defaults to "card" (one card per row);
   *  "table" renders an antd-style table with one column per item field. */
  variant?: "card" | "table";
  /** Table variant only: when true, each row's cells are read-only and an Edit
   *  button opens the row's `itemFields` in a modal (via `openFormDialog`), writing
   *  the result back on OK. Ignored for the card variant. */
  editInDialog?: boolean;
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  itemFields: FieldNode[];
}

/* ----------------------------------------------------------------------------
 * Layout containers (additive, no formVersion bump). They are TRANSPARENT for
 * values: their children's values hoist to the parent object — only `array`
 * nests values. They carry no `name`. A hidden container (visibleWhen /
 * permissions) hides its whole subtree.
 *
 * `tab-pane` / `collapse-panel` are union members of their own so the designer
 * tree can treat every node uniformly (select/drag a pane like any node), but
 * their PLACEMENT is structurally restricted: `tabs.children` only accepts
 * panes, `collapse.children` only panels. A pane appearing elsewhere in
 * hand-written JSON still parses — builder metas prevent authoring that, and
 * renderers fall back to rendering its children as a plain row.
 * ------------------------------------------------------------------------- */

export interface TabPaneField {
  type: "tab-pane";
  label: string;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export interface TabsField {
  type: "tabs";
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: TabPaneField[];
}

export interface CollapsePanelField {
  type: "collapse-panel";
  label: string;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export interface CollapseField {
  type: "collapse";
  /** Only one panel open at a time. */
  accordion?: boolean;
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: CollapsePanelField[];
}

export interface CardField {
  type: "card";
  title?: string;
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export interface GridField {
  type: "grid";
  /** Columns per row (1–24). Renderers default to 2. */
  cols?: number;
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export interface SpaceField {
  type: "space";
  direction?: "horizontal" | "vertical";
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export type FieldNode =
  | LeafField
  | GroupField
  | ArrayField
  | TabsField
  | TabPaneField
  | CollapseField
  | CollapsePanelField
  | CardField
  | GridField
  | SpaceField;

export const groupFieldSchema: z.ZodType<GroupField> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    name: z.string().min(1),
    label: z.string().optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const arrayFieldSchema: z.ZodType<ArrayField> = z.lazy(() =>
  z.object({
    type: z.literal("array"),
    name: z.string().min(1),
    label: z.string().optional(),
    helpText: z.string().optional(),
    tooltip: z.string().optional(),
    required: z.boolean().optional(),
    minItems: z.number().int().min(0).optional(),
    maxItems: z.number().int().min(0).optional(),
    variant: z.enum(["card", "table"]).optional(),
    editInDialog: z.boolean().optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    itemFields: z.array(fieldNodeSchema),
  }),
);

export const tabPaneFieldSchema: z.ZodType<TabPaneField> = z.lazy(() =>
  z.object({
    type: z.literal("tab-pane"),
    label: z.string(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const tabsFieldSchema: z.ZodType<TabsField> = z.lazy(() =>
  z.object({
    type: z.literal("tabs"),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(tabPaneFieldSchema),
  }),
);

export const collapsePanelFieldSchema: z.ZodType<CollapsePanelField> = z.lazy(() =>
  z.object({
    type: z.literal("collapse-panel"),
    label: z.string(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const collapseFieldSchema: z.ZodType<CollapseField> = z.lazy(() =>
  z.object({
    type: z.literal("collapse"),
    accordion: z.boolean().optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(collapsePanelFieldSchema),
  }),
);

export const cardFieldSchema: z.ZodType<CardField> = z.lazy(() =>
  z.object({
    type: z.literal("card"),
    title: z.string().optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const gridFieldSchema: z.ZodType<GridField> = z.lazy(() =>
  z.object({
    type: z.literal("grid"),
    cols: z.number().int().min(1).max(24).optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const spaceFieldSchema: z.ZodType<SpaceField> = z.lazy(() =>
  z.object({
    type: z.literal("space"),
    direction: z.enum(["horizontal", "vertical"]).optional(),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const fieldNodeSchema: z.ZodType<FieldNode> = z.lazy(() =>
  z.union([
    textFieldSchema,
    textareaFieldSchema,
    numberFieldSchema,
    selectFieldSchema,
    radioFieldSchema,
    dateFieldSchema,
    timeFieldSchema,
    checkboxFieldSchema,
    switchFieldSchema,
    passwordFieldSchema,
    sliderFieldSchema,
    rateFieldSchema,
    colorFieldSchema,
    groupFieldSchema,
    arrayFieldSchema,
    tabsFieldSchema,
    tabPaneFieldSchema,
    collapseFieldSchema,
    collapsePanelFieldSchema,
    cardFieldSchema,
    gridFieldSchema,
    spaceFieldSchema,
  ]),
);

export const formSchema = z.object({
  formVersion: z.number().int(),
  id: z.string(),
  title: z.string(),
  /** Form-wide antd layout (label/wrapper cols, horizontal/vertical…). Optional
   *  → additive; renderers fall back to their historical defaults when absent. */
  layoutProps: formLayoutPropsSchema.optional(),
  fields: z.array(fieldNodeSchema),
  settings: z.object({ submitUrl: z.string().optional() }).optional(),
});

export type FormSchema = z.infer<typeof formSchema>;
