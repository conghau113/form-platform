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
 *  - `required` → toggle the target's required-ness (payload boolean, defaults true;
 *                 false un-requires a statically-required field while matched)
 *  Evaluated by form-core's reactions engine. NEVER eval() these rules. */
export const reactionEffectSchema = z.enum(["visible", "disabled", "value", "options", "required"]);
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

/** Rule severity: `error` (default) blocks submit; `warning` never blocks — it only
 *  surfaces as a non-blocking hint (antd `validateStatus="warning"`). */
export const validationSeveritySchema = z.enum(["error", "warning"]);

/** A single field validation rule. Translated to Zod by form-core's buildZodSchema.
 *  - `len`/`min`/`max`: numeric `value` (string length or numeric bound by field type).
 *  - `pattern`: `value` is a regex SOURCE string — compiled via `new RegExp`, NEVER eval.
 *  - `format`: a named check selected by `format` (email | url | phone | integer |
 *    number | money | idcard | zh | en | qq | zip). Each maps to a fixed regex (or a
 *    Zod built-in) in form-core — declarative, never eval.
 *  - `required`: presence; equivalent to the `required` flag, kept here for a custom message.
 *  - `cross`: a cross-field assertion — `rule` is a SAFE JSONLogic record (same shape as
 *    `conditionSchema.rule`, evaluated via json-logic, NEVER eval) that must evaluate
 *    TRUE against the field's value scope (merged row scope inside arrays) for the
 *    field to be valid.
 *  `message` overrides the default error text when the rule fails. */
export const validationRuleSchema = z.object({
  type: z.enum(["required", "len", "min", "max", "pattern", "format", "cross"]),
  value: z.union([z.string(), z.number()]).optional(),
  format: z
    .enum([
      "email",
      "url",
      "phone",
      "integer",
      "number",
      "money",
      "idcard",
      "zh",
      "en",
      "qq",
      "zip",
    ])
    .optional(),
  message: z.string().optional(),
  /** Defaults to "error" when absent. */
  severity: validationSeveritySchema.optional(),
  /** `type: "cross"` only — the JSONLogic assertion. */
  rule: z.record(z.string(), z.any()).optional(),
});

export type ValidationRule = z.infer<typeof validationRuleSchema>;

/** Debounced remote value check (e.g. username-exists). Protocol: GET
 *  `url?value=<value>&name=<fieldName>` → JSON `{ valid: boolean, message?: string }`.
 *  An explicit `valid: false` BLOCKS submit (the renderer routes it through the form
 *  resolver); a network failure fails OPEN (never blocks). `message` is the fallback
 *  error text when the response carries none. */
export const asyncValidatorSchema = z.object({
  url: z.string(),
  message: z.string().optional(),
  /** Debounce window in ms before the request fires (renderer default 400). */
  debounceMs: z.number().optional(),
});

export type AsyncValidator = z.infer<typeof asyncValidatorSchema>;

/** When a renderer runs validation. Maps onto react-hook-form's `mode`:
 *  onInput→"onChange", onBlur→"onBlur", onSubmit (default) → "onSubmit". */
export const validateTriggerSchema = z.enum(["onInput", "onBlur", "onSubmit"]);

export type ValidateTrigger = z.infer<typeof validateTriggerSchema>;

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

/** antd control size override. Web-only, additive — native ignores it. Shared by
 *  the input + choice families rather than living on every field. */
const sizeProp = { size: z.enum(["small", "middle", "large"]).optional() };
/** antd input visual variant (border treatment). Web-only, additive. */
const variantProp = { variant: z.enum(["outlined", "filled", "borderless"]).optional() };

const commonFields = {
  name: z.string().min(1),
  label: z.string(),
  helpText: z.string().optional(),
  /** Short hint rendered as an info tooltip next to the label. */
  tooltip: z.string().optional(),
  /** Persistent secondary hint rendered under the control (antd Form.Item `extra`).
   *  Unlike `helpText` (antd `help`), a validation message never replaces it — use it
   *  for always-on guidance. Web-only, additive; the native renderer ignores it. */
  extra: z.string().optional(),
  /** Show antd Form.Item's feedback status icon (success/error/validating). Web-only,
   *  additive; native ignores it. */
  hasFeedback: z.boolean().optional(),
  required: z.boolean().optional(),
  /** Interaction pattern flags, layered on each other (Formily's `pattern`, expressed
   *  additively). Precedence in the renderer is `readPretty > readOnly > disabled >
   *  editable`: `readPretty` shows the value as plain text (review mode), `readOnly`
   *  shows a non-interactive control, `disabled` greys it out. */
  disabled: z.boolean().optional(),
  /** Non-interactive but not greyed — the user can read the value, not edit it. */
  readOnly: z.boolean().optional(),
  /** Render the value as plain text (PreviewText), no control. */
  readPretty: z.boolean().optional(),
  /** Seed value applied when a fresh form is rendered with no initialValues. */
  defaultValue: z.any().optional(),
  /** Field-level validation rules, compiled to Zod by form-core. Additive: old
   *  JSON without this key keeps parsing, so no formVersion bump is required. */
  validations: z.array(validationRuleSchema).optional(),
  /** Debounced remote value check; see {@link asyncValidatorSchema}. */
  asyncValidator: asyncValidatorSchema.optional(),
  layout: layoutSchema.optional(),
  /** Per-field Form.Item overrides of the root `layoutProps` (labelCol etc.). */
  decoratorProps: decoratorPropsSchema.optional(),
  visibleWhen: conditionSchema.optional(),
  /** Linkage rules driven by other fields' values. Additive: old JSON without
   *  this key keeps parsing, so no formVersion bump is required. */
  reactions: z.array(reactionSchema).optional(),
  permissions: permissionSchema.optional(),
  /** Link to a reusable **preset** (Track W4 — linked fields). When set, this field is an
   *  *instance* of the named preset: a consumer (form-core's `resolveLinkedFields`) re-applies
   *  the preset's `patch` then {@link overrides} on top of this node when the preset is
   *  resolvable, and falls back to this node's own props (a frozen snapshot) when it is not
   *  (deleted / changed type). Organisational metadata referenced by id — it never embeds the
   *  preset body. Additive: old JSON without this key keeps parsing, so no formVersion bump. */
  presetId: z.string().optional(),
  /** Per-instance overrides layered on top of the linked preset's `patch` (keys where this
   *  instance diverges). Opaque declarative data, never eval'd — same character as a preset's
   *  own `patch`. Meaningful only alongside {@link presetId}. Additive: old JSON without this
   *  key keeps parsing, so no formVersion bump is required. */
  overrides: z.record(z.string(), z.unknown()).optional(),
};

export const textFieldSchema = z.object({
  type: z.literal("text"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
  /** Show a clear (×) button when non-empty. */
  allowClear: z.boolean().optional(),
  /** Show a character counter (reads `maxLength` when set). */
  showCount: z.boolean().optional(),
  /** Inline text/symbol rendered inside the input before/after the value. */
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  /** Icon token rendered inside the input before/after the value, resolved via the web
   *  renderer's icon registry (e.g. `"antd:SearchOutlined"`). Takes visual precedence over
   *  the text `prefix`/`suffix` when both are set. Web-only; other renderers ignore it. */
  prefixIcon: z.string().optional(),
  suffixIcon: z.string().optional(),
  /** Label fused outside the input on the left/right (antd addon). */
  addonBefore: z.string().optional(),
  addonAfter: z.string().optional(),
  ...sizeProp,
  ...variantProp,
});

/** Textarea auto-grow: `true` grows freely; `{minRows,maxRows}` bounds it. When set,
 *  antd ignores `rows`. The builder authors the boolean; the object form still parses. */
export const textareaAutoSizeSchema = z.union([
  z.boolean(),
  z.object({ minRows: z.number().int().optional(), maxRows: z.number().int().optional() }),
]);

export const textareaFieldSchema = z.object({
  type: z.literal("textarea"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
  rows: z.number().int().optional(),
  allowClear: z.boolean().optional(),
  showCount: z.boolean().optional(),
  autoSize: textareaAutoSizeSchema.optional(),
  ...sizeProp,
});

/** Declarative numeric display formatting. The renderer maps the preset to antd
 *  formatter/parser functions — the JSON NEVER carries a function (no eval). */
export const numberDisplayFormatSchema = z.enum(["thousands", "currency", "percent"]);

export const numberFieldSchema = z.object({
  type: z.literal("number"),
  ...commonFields,
  min: z.number().optional(),
  max: z.number().optional(),
  /** Increment applied by the stepper buttons / arrow keys. */
  step: z.number().optional(),
  /** Number of decimal places the input formats to. */
  precision: z.number().int().optional(),
  /** Inline prefix inside the input (e.g. "$"). */
  prefix: z.string().optional(),
  /** Icon token rendered inside the input as the prefix, resolved via the web renderer's
   *  icon registry (e.g. `"antd:DollarOutlined"`). Takes visual precedence over the text
   *  `prefix` when both are set. Web-only; other renderers ignore it. */
  prefixIcon: z.string().optional(),
  addonBefore: z.string().optional(),
  addonAfter: z.string().optional(),
  /** Show the up/down stepper handles (antd `controls`, default true). */
  controls: z.boolean().optional(),
  /** Let up/down arrow keys change the value (antd `keyboard`). */
  keyboard: z.boolean().optional(),
  /** Named display preset; see {@link numberDisplayFormatSchema}. */
  displayFormat: numberDisplayFormatSchema.optional(),
  /** ISO currency code used when `displayFormat = "currency"` (default "USD"). */
  currency: z.string().optional(),
  ...sizeProp,
  ...variantProp,
});

export const optionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

/** A hierarchical option for cascader / tree-select: an option that may carry
 *  child options. The explicit `z.ZodType` annotation keeps the recursive
 *  `z.lazy` inference sound (same pattern as the container schemas below). */
export interface TreeOption {
  label: string;
  value: string | number;
  children?: TreeOption[];
}

export const treeOptionSchema: z.ZodType<TreeOption> = z.lazy(() =>
  z.object({
    label: z.string(),
    value: z.union([z.string(), z.number()]),
    children: z.array(treeOptionSchema).optional(),
  }),
);

/** Remote option source for a select. `dependsOn` (single parent) is the level-1
 *  shorthand; `params` maps any number of query params to other fields' current
 *  values (level 2). `ttlMs` caches results for that long (renderer staleTime). */
export const selectDataSourceSchema = z.object({
  url: z.string(),
  labelKey: z.string(),
  valueKey: z.string(),
  dependsOn: z.string().optional(),
  params: z
    .array(
      z.object({
        /** Query-param name to send. */
        name: z.string(),
        /** Source field whose current value fills the param. */
        from: z.string(),
      }),
    )
    .optional(),
  ttlMs: z.number().optional(),
  /** When set, response rows are mapped RECURSIVELY: each row's `childrenKey`
   *  array maps through the same labelKey/valueKey, producing a tree of options
   *  (for cascader / tree-select). Flat consumers simply ignore it. */
  childrenKey: z.string().optional(),
});

export const selectFieldSchema = z.object({
  type: z.literal("select"),
  ...commonFields,
  multiple: z.boolean().optional(),
  /** Free-tagging mode: the user can type values not in `options`. Implies a multi
   *  (array) value; in the renderer `tags` wins over `multiple`. */
  tags: z.boolean().optional(),
  /** Filterable dropdown (antd `showSearch`). */
  showSearch: z.boolean().optional(),
  /** Show a clear (×) button. */
  allowClear: z.boolean().optional(),
  /** Placeholder shown when nothing is selected. */
  placeholder: z.string().optional(),
  /** Max selected tags shown before "+N" (multiple/tags); `"responsive"` fits the row. */
  maxTagCount: z.union([z.number().int(), z.literal("responsive")]).optional(),
  options: z.array(optionSchema).optional(),
  dataSource: selectDataSourceSchema.optional(),
  ...sizeProp,
  ...variantProp,
});

/** Multi-select rendered as a group of checkboxes. Shares the option/dataSource shape
 *  with select (static `options` or a remote `dataSource`); value is an array of the
 *  chosen option values. */
export const checkboxGroupFieldSchema = z.object({
  type: z.literal("checkbox-group"),
  ...commonFields,
  /** Lay the checkboxes out in a row (default) or stacked column. */
  direction: z.enum(["horizontal", "vertical"]).optional(),
  options: z.array(optionSchema).optional(),
  dataSource: selectDataSourceSchema.optional(),
});

/** One uploaded file's serializable metadata (a subset of antd's `UploadFile`). A live
 *  local file also carries a non-serializable `originFileObj`, which is NOT validated —
 *  the value is checked as a plain array so the runtime fileList never fails. */
export const uploadFileSchema = z.object({
  uid: z.string(),
  name: z.string(),
  url: z.string().optional(),
  status: z.string().optional(),
});

/** File attachment input. Value is an array of {@link uploadFileSchema} metadata. By
 *  default files stay local (the renderer prevents auto-upload); a real upload happens
 *  only when the form's `settings.submitUrl` is set. */
export const uploadFieldSchema = z.object({
  type: z.literal("upload"),
  ...commonFields,
  /** Accepted file types (the HTML `accept` attribute, e.g. "image/*,.pdf"). */
  accept: z.string().optional(),
  /** Max number of files allowed. */
  maxCount: z.number().int().optional(),
  /** antd list layout. */
  listType: z.enum(["text", "picture", "picture-card"]).optional(),
  /** Allow picking several files at once in the native picker. */
  multiple: z.boolean().optional(),
  /** Upload a whole directory (sets the picker's `webkitdirectory`). Web-only. */
  directory: z.boolean().optional(),
  /** Render the large drop‑zone variant (antd `Upload.Dragger`) instead of a button.
   *  Web-only, additive; the native renderer falls back to its default file picker. */
  dragger: z.boolean().optional(),
});

/** Hierarchical single-path choice (antd Cascader). The value is the PATH of
 *  chosen option values from root to leaf, so it is always an array even for a
 *  single selection. Options are a {@link treeOptionSchema} tree, static or
 *  remote (a `dataSource` with `childrenKey` returns a tree). */
export const cascaderFieldSchema = z.object({
  type: z.literal("cascader"),
  ...commonFields,
  options: z.array(treeOptionSchema).optional(),
  dataSource: selectDataSourceSchema.optional(),
});

/** Tree-shaped dropdown choice (antd TreeSelect). Unlike cascader the value is
 *  the chosen node's value itself — a scalar, or an array when `multiple`. */
export const treeSelectFieldSchema = z.object({
  type: z.literal("tree-select"),
  ...commonFields,
  multiple: z.boolean().optional(),
  options: z.array(treeOptionSchema).optional(),
  dataSource: selectDataSourceSchema.optional(),
});

/** Calendar granularity variant for date pickers (antd `picker` prop). */
export const datePickerVariantSchema = z.enum(["date", "week", "month", "quarter", "year"]);

/** Shared display props for the date pickers (antd DatePicker / RangePicker). All
 *  declarative: `format` is a dayjs token STRING passed straight to antd, never code. */
const datePickerProps = {
  /** Display/parse format token string (e.g. "YYYY-MM-DD", "DD/MM/YYYY"). */
  format: z.string().optional(),
  /** Also pick a time-of-day alongside the date. */
  showTime: z.boolean().optional(),
  /** Show a clear (×) button. */
  allowClear: z.boolean().optional(),
  ...sizeProp,
  ...variantProp,
};

/** Shared display props for the time pickers (antd TimePicker / RangePicker). */
const timePickerProps = {
  /** Display/parse format token string (e.g. "HH:mm", "hh:mm A"). */
  format: z.string().optional(),
  /** 12-hour clock with an AM/PM selector. */
  use12Hours: z.boolean().optional(),
  /** Minute increment offered in the dropdown (e.g. 5, 15). */
  minuteStep: z.number().int().positive().optional(),
  /** Show a clear (×) button. */
  allowClear: z.boolean().optional(),
  ...sizeProp,
  ...variantProp,
};

export const dateFieldSchema = z.object({
  type: z.literal("date"),
  ...commonFields,
  picker: datePickerVariantSchema.optional(),
  ...datePickerProps,
});
export const timeFieldSchema = z.object({
  type: z.literal("time"),
  ...commonFields,
  ...timePickerProps,
});

/** Date interval input (antd RangePicker). The value is a `[start, end]` tuple;
 *  like `date`, the element shape is platform-specific (dayjs on web). */
export const dateRangeFieldSchema = z.object({
  type: z.literal("date-range"),
  ...commonFields,
  picker: datePickerVariantSchema.optional(),
  ...datePickerProps,
});

/** Time interval input (antd TimePicker.RangePicker). Value is `[start, end]`. */
export const timeRangeFieldSchema = z.object({
  type: z.literal("time-range"),
  ...commonFields,
  ...timePickerProps,
});
export const checkboxFieldSchema = z.object({ type: z.literal("checkbox"), ...commonFields });
export const switchFieldSchema = z.object({
  type: z.literal("switch"),
  ...commonFields,
  /** Content shown inside the switch when ON (short text/symbol). */
  checkedChildren: z.string().optional(),
  /** Content shown inside the switch when OFF. */
  unCheckedChildren: z.string().optional(),
  /** antd Switch size — only `default`/`small` (not the shared size enum). Web-only. */
  size: z.enum(["default", "small"]).optional(),
});

/** Single choice rendered as a radio group. Shares the option/dataSource shape
 *  with select so authoring tooling can reuse it. */
export const radioFieldSchema = z.object({
  type: z.literal("radio"),
  ...commonFields,
  options: z.array(optionSchema).optional(),
  /** Classic radios (default) or a segmented button group (antd `optionType`). */
  optionType: z.enum(["default", "button"]).optional(),
  /** Button fill style — only meaningful when `optionType = "button"`. */
  buttonStyle: z.enum(["outline", "solid"]).optional(),
  ...sizeProp,
});

export const passwordFieldSchema = z.object({
  type: z.literal("password"),
  ...commonFields,
  placeholder: z.string().optional(),
  maxLength: z.number().int().optional(),
  /** Show a clear (×) button when non-empty. */
  allowClear: z.boolean().optional(),
  ...sizeProp,
  ...variantProp,
});

export const sliderFieldSchema = z.object({
  type: z.literal("slider"),
  ...commonFields,
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  /** Two-handle range slider; the value becomes a `[start, end]` tuple. */
  range: z.boolean().optional(),
  /** Orient the track vertically. */
  vertical: z.boolean().optional(),
  /** Render a dot at each `step` along the track. */
  dots: z.boolean().optional(),
});

/** Named glyph preset for the Rate character. Declarative — maps to a default star or a
 *  plain text glyph in the renderer, never an imported icon or code. */
export const rateCharacterSchema = z.enum(["star", "heart", "like"]);

export const rateFieldSchema = z.object({
  type: z.literal("rate"),
  ...commonFields,
  /** Number of stars; defaults to 5 in the renderer. */
  count: z.number().int().optional(),
  allowHalf: z.boolean().optional(),
  /** Glyph shown for each unit; defaults to a star. */
  character: rateCharacterSchema.optional(),
  /** Click the selected value again to clear back to none. */
  allowClear: z.boolean().optional(),
});

export const colorFieldSchema = z.object({ type: z.literal("color"), ...commonFields });

/** A static, value-LESS display node: authored content shown to the user (a heading,
 *  paragraph or inline note). It is a nameless leaf — it owns no `name` and no value, so
 *  it never contributes to the submitted object or to validation. Additive: old JSON
 *  without it keeps parsing, so no formVersion bump is required. */
export const displayTextFieldSchema = z.object({
  type: z.literal("display-text"),
  /** The authored content rendered to the user. */
  content: z.string(),
  /** How the content renders: a heading (`Typography.Title`), a `Paragraph`, or inline
   *  `Text`. Defaults to "paragraph" in the renderer when absent. */
  variant: z.enum(["title", "paragraph", "text"]).optional(),
  /** antd `Typography.Title` level (1–5); only meaningful when `variant: "title"`. */
  level: z.number().int().min(1).max(5).optional(),
  /** Text alignment. Web-only, additive; other renderers ignore it. */
  align: z.enum(["left", "center", "right"]).optional(),
  layout: layoutSchema.optional(),
  visibleWhen: conditionSchema.optional(),
  permissions: permissionSchema.optional(),
});

export type DisplayTextField = z.infer<typeof displayTextFieldSchema>;

export type LeafField =
  | z.infer<typeof textFieldSchema>
  | z.infer<typeof textareaFieldSchema>
  | z.infer<typeof numberFieldSchema>
  | z.infer<typeof selectFieldSchema>
  | z.infer<typeof checkboxGroupFieldSchema>
  | z.infer<typeof cascaderFieldSchema>
  | z.infer<typeof treeSelectFieldSchema>
  | z.infer<typeof uploadFieldSchema>
  | z.infer<typeof radioFieldSchema>
  | z.infer<typeof dateFieldSchema>
  | z.infer<typeof timeFieldSchema>
  | z.infer<typeof dateRangeFieldSchema>
  | z.infer<typeof timeRangeFieldSchema>
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
   *  "table" renders an antd-style table with one column per item field; "auto" is
   *  responsive — the web renderer shows the table on wide screens and falls back to
   *  cards on narrow ones (the native renderer always uses cards). */
  variant?: "card" | "table" | "auto";
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

export interface StepField {
  type: "step";
  label: string;
  /** Sub-title shown under the step's title in the antd Steps header. */
  description?: string;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: FieldNode[];
}

export interface StepsField {
  type: "steps";
  layout?: z.infer<typeof layoutSchema>;
  visibleWhen?: z.infer<typeof conditionSchema>;
  permissions?: z.infer<typeof permissionSchema>;
  children: StepField[];
}

export type FieldNode =
  | LeafField
  | DisplayTextField
  | GroupField
  | ArrayField
  | TabsField
  | TabPaneField
  | CollapseField
  | CollapsePanelField
  | CardField
  | GridField
  | SpaceField
  | StepsField
  | StepField;

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
    variant: z.enum(["card", "table", "auto"]).optional(),
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

export const stepFieldSchema: z.ZodType<StepField> = z.lazy(() =>
  z.object({
    type: z.literal("step"),
    label: z.string(),
    description: z.string().optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(fieldNodeSchema),
  }),
);

export const stepsFieldSchema: z.ZodType<StepsField> = z.lazy(() =>
  z.object({
    type: z.literal("steps"),
    layout: layoutSchema.optional(),
    visibleWhen: conditionSchema.optional(),
    permissions: permissionSchema.optional(),
    children: z.array(stepFieldSchema),
  }),
);

export const fieldNodeSchema: z.ZodType<FieldNode> = z.lazy(() =>
  z.union([
    textFieldSchema,
    textareaFieldSchema,
    numberFieldSchema,
    selectFieldSchema,
    checkboxGroupFieldSchema,
    cascaderFieldSchema,
    treeSelectFieldSchema,
    uploadFieldSchema,
    radioFieldSchema,
    dateFieldSchema,
    timeFieldSchema,
    dateRangeFieldSchema,
    timeRangeFieldSchema,
    checkboxFieldSchema,
    switchFieldSchema,
    passwordFieldSchema,
    sliderFieldSchema,
    rateFieldSchema,
    colorFieldSchema,
    displayTextFieldSchema,
    groupFieldSchema,
    arrayFieldSchema,
    tabsFieldSchema,
    tabPaneFieldSchema,
    collapseFieldSchema,
    collapsePanelFieldSchema,
    cardFieldSchema,
    gridFieldSchema,
    spaceFieldSchema,
    stepsFieldSchema,
    stepFieldSchema,
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
  settings: z
    .object({
      submitUrl: z.string().optional(),
      /** When the renderer validates: while typing, on blur, or only on submit
       *  (the default when absent — matches react-hook-form's default mode). */
      validateTrigger: validateTriggerSchema.optional(),
    })
    .optional(),
});

export type FormSchema = z.infer<typeof formSchema>;
