import {
  type ArrayField,
  type AsyncValidator,
  type FieldNode,
  type FormSchema,
  isLayoutContainer,
  type LeafField,
  type ValidationRule,
} from "@org/form-schema";
import { z } from "zod";
import { evalRule } from "./conditions.js";
import { enMessages, type FormatCheckName, type ValidationMessages } from "./messages.js";
import { type AccessContext, canView } from "./rbac.js";
import {
  computeNodeReactions,
  computeReactions,
  type EffectMap,
  effectiveVisible,
} from "./reactions.js";

/** Fixed `format` regexes, compiled from string literals — declarative, NEVER eval.
 *  `email`/`url` are handled by Zod's built-ins instead and are intentionally absent here.
 *  The default failure MESSAGE for each lives in the locale message pack (`messages.format`),
 *  not here, so it localizes. Mirrors the form-relevant subset of Formily's validator registry. */
const FORMAT_PATTERNS: Record<FormatCheckName, RegExp> = {
  // optional leading +, then 7–15 digits, allowing spaces, dashes and parens as separators
  phone: /^\+?[0-9][0-9\s\-()]{6,18}[0-9]$/,
  integer: /^[+-]?\d+$/,
  number: /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/,
  // optional thousands grouping, up to 2 decimals
  money: /^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/,
  // 15-digit (old) or 18-digit (new; trailing checksum may be X) Chinese ID card
  idcard: /^\d{15}$|^\d{17}[\dxX]$/,
  zh: /^[一-龥]+$/,
  en: /^[A-Za-z]+$/,
  qq: /^[1-9][0-9]{4,10}$/,
  zip: /^\d{6}$/,
};

/** Compile a regex from a schema-provided SOURCE string. A malformed pattern must
 *  not throw at build time, so we swallow the error and skip the rule. NEVER eval. */
function safeRegExp(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

/** Apply string-oriented validation rules (len/min/max/pattern/format) onto a Zod
 *  string. `required` is handled by the caller (it gates optional vs presence). `m`
 *  supplies the localized default message for `format` checks (a custom `r.message` wins). */
function applyStringRules(
  s: z.ZodString,
  rules: ValidationRule[],
  m: ValidationMessages,
): z.ZodString {
  let out = s;
  for (const r of rules) {
    switch (r.type) {
      case "len":
        if (typeof r.value === "number") out = out.length(r.value, r.message);
        break;
      case "min":
        if (typeof r.value === "number") out = out.min(r.value, r.message);
        break;
      case "max":
        if (typeof r.value === "number") out = out.max(r.value, r.message);
        break;
      case "pattern": {
        if (typeof r.value === "string") {
          const re = safeRegExp(r.value);
          if (re) out = out.regex(re, r.message);
        }
        break;
      }
      case "format": {
        if (r.format === "email") out = out.email(r.message);
        else if (r.format === "url") out = out.url(r.message);
        else if (r.format) {
          const re = FORMAT_PATTERNS[r.format as FormatCheckName];
          if (re) out = out.regex(re, r.message ?? m.format[r.format as FormatCheckName]);
        }
        break;
      }
    }
  }
  return out;
}

/** Apply numeric validation rules (min/max) onto a Zod number. */
function applyNumberRules(s: z.ZodNumber, rules: ValidationRule[]): z.ZodNumber {
  let out = s;
  for (const r of rules) {
    if (r.type === "min" && typeof r.value === "number") out = out.min(r.value, r.message);
    else if (r.type === "max" && typeof r.value === "number") out = out.max(r.value, r.message);
  }
  return out;
}

export interface BuildZodOptions {
  /** Current form values. Drives conditional visibility so hidden fields are
   *  excluded from validation. Defaults to {} (everything visible). */
  values?: Record<string, unknown>;
  /** When provided, fields the role can't view are excluded too (they aren't
   *  rendered, so they must not block submit). */
  access?: AccessContext;
  /** Localized default messages (i18n P3). Defaults to {@link enMessages} ⇒ today's exact
   *  English. The renderer resolves this from its `locale` via `resolveMessages`. The pack's
   *  `errorMap` (for bare Zod constraints) must be applied by the CALLER at parse time. */
  messages?: ValidationMessages;
}

function labelOf(node: { label?: string; name: string }): string {
  return node.label?.trim() ? node.label : node.name;
}

/** Severity defaults to "error" when a rule doesn't declare one. */
function ruleSeverity(r: ValidationRule): "error" | "warning" {
  return r.severity ?? "error";
}

/** Map one leaf field to a Zod type, honoring required + per-type constraints.
 *  `requiredOverride` (from a reaction `required` effect) wins over the static
 *  `required` flag/rule when present — true forces required, false un-requires.
 *  THE single severity filter point: the blocking schema sees only error-severity,
 *  non-cross rules — warnings surface via `collectWarnings` and cross assertions
 *  via `withCrossChecks`, both built on the same `leafZodWith` core so the two
 *  paths cannot drift. */
function leafZod(node: LeafField, m: ValidationMessages, requiredOverride?: boolean): z.ZodTypeAny {
  const rules = (node.validations ?? []).filter(
    (r) => r.type !== "cross" && ruleSeverity(r) === "error",
  );
  return leafZodWith(node, rules, m, requiredOverride);
}

/** The per-type rule compiler shared by the blocking (error) and warning paths;
 *  `rules` is pre-filtered by the caller. `m` supplies localized default messages. */
function leafZodWith(
  node: LeafField,
  rules: ValidationRule[],
  m: ValidationMessages,
  requiredOverride?: boolean,
): z.ZodTypeAny {
  const requiredRule = rules.find((r) => r.type === "required");
  // The `required` flag and a `required` validation rule are equivalent; either
  // one makes the field mandatory. A rule's `message` customizes the text. A reaction
  // `required` effect (requiredOverride) takes precedence over both.
  const required =
    requiredOverride !== undefined
      ? requiredOverride
      : node.required === true || requiredRule != null;
  const requiredMsg = requiredRule?.message ?? m.required(labelOf(node));

  switch (node.type) {
    case "text":
    case "textarea":
    case "password": {
      // When required, an undefined/empty value must surface the same message,
      // so set the type-error too (z.string() otherwise reports "Required").
      let s = z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg });
      if (node.maxLength != null) s = s.max(node.maxLength);
      s = applyStringRules(s, rules, m);
      if (required) return s.min(1, requiredMsg);
      // Optional + format/pattern rules would reject "" from an untouched input, so
      // treat empty string as "absent" and only validate non-empty values.
      return rules.length ? z.union([z.literal(""), s]).optional() : s.optional();
    }
    case "number":
    case "slider":
    case "rate": {
      let s = z.number({ required_error: requiredMsg, invalid_type_error: requiredMsg });
      if (node.type !== "rate") {
        if (node.min != null) s = s.min(node.min);
        if (node.max != null) s = s.max(node.max);
      }
      s = applyNumberRules(s, rules);
      return required ? s : s.optional();
    }
    case "select":
    case "radio": {
      const value = z.union([z.string(), z.number()]);
      if (node.type === "select" && node.multiple) {
        const arr = z.array(value);
        return required ? arr.min(1, requiredMsg) : arr.optional();
      }
      return required ? value.refine((v) => v !== "" && v != null, requiredMsg) : value.optional();
    }
    case "checkbox":
    case "switch": {
      const b = z.boolean();
      return required ? b.refine((v) => v === true, requiredMsg) : b.optional();
    }
    case "checkbox-group": {
      // A group of checkboxes; the value is an array of the chosen option values.
      const arr = z.array(z.union([z.string(), z.number()]));
      return required ? arr.min(1, requiredMsg) : arr.optional();
    }
    case "cascader": {
      // The value is the PATH of option values root→leaf, so it is an array even
      // for a single selection; required means a non-empty path.
      const arr = z.array(z.union([z.string(), z.number()]));
      return required ? arr.min(1, requiredMsg) : arr.optional();
    }
    case "tree-select": {
      const value = z.union([z.string(), z.number()]);
      if (node.multiple) {
        const arr = z.array(value);
        return required ? arr.min(1, requiredMsg) : arr.optional();
      }
      return required ? value.refine((v) => v !== "" && v != null, requiredMsg) : value.optional();
    }
    case "upload": {
      // The value is the antd fileList (array of file metadata + live local files), so
      // it is validated as a plain array. Presence (required) means ≥1 file; maxCount
      // bounds the upper end. Element shape is left to the renderer/persistence layer.
      let arr = z.array(z.any());
      if (node.maxCount != null)
        arr = arr.max(node.maxCount, m.maxFiles(labelOf(node), node.maxCount));
      return required ? arr.min(1, requiredMsg) : arr.optional();
    }
    case "color": {
      // A color is a string (hex/rgb); presence is asserted when required, plus any
      // string rules (e.g. a pattern enforcing a hex shape).
      let s = z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg });
      s = applyStringRules(s, rules, m);
      if (required) return s.min(1, requiredMsg);
      return rules.length ? z.union([z.literal(""), s]).optional() : s.optional();
    }
    case "date":
    case "time": {
      // Date/time values are platform-specific (dayjs on web, string on native), so
      // we only assert presence when required and leave the shape to the renderer.
      return required
        ? z.any().refine((v) => v != null && v !== "", requiredMsg)
        : z.any().optional();
    }
    case "date-range":
    case "time-range": {
      // A [start, end] tuple of platform-specific values (dayjs on web). Like
      // date/time we assert only presence — both ends — when required; antd's
      // clear emits null, which the optional branch accepts.
      return required
        ? z
            .any()
            .refine(
              (v) => Array.isArray(v) && v.length === 2 && v[0] != null && v[1] != null,
              requiredMsg,
            )
        : z.any().optional();
    }
  }
}

/** Build the per-row Zod object for an array, scoped to that row. Each row sees a
 *  MERGED value object (`{ ...outer, ...row }`, row keys win) so its `visibleWhen` and
 *  reactions can reference both sibling row fields and outer form fields. Reactions are
 *  recomputed per row, so per-row linkage is honored (this lifts the old Phase C
 *  always-visible limitation). */
function rowShape(
  node: ArrayField,
  row: Record<string, unknown>,
  outer: Record<string, unknown>,
  m: ValidationMessages,
  access?: AccessContext,
): z.ZodObject<z.ZodRawShape> {
  const merged = { ...outer, ...row };
  const rowEffects = computeNodeReactions(node.itemFields, merged);
  return z.object(buildShape(node.itemFields, merged, m, access, rowEffects));
}

/** Compile an `array` (Form List) node to a Zod array of row objects. Length bounds
 *  (`required`/min/max) are asserted on the raw array FIRST; then `superRefine`
 *  validates each row against its own reactive shape (emitting issues at `[i, ...path]`)
 *  and `transform` re-parses each row to strip its hidden/non-viewable keys.
 *  `required` implies minItems 1. */
function arrayZod(
  node: ArrayField,
  values: Record<string, unknown>,
  m: ValidationMessages,
  access?: AccessContext,
): z.ZodTypeAny {
  // `required` means ≥1; when both are set the stricter bound wins, so an explicit
  // `minItems: 0` never silently cancels `required: true`.
  const min = node.required ? Math.max(node.minItems ?? 0, 1) : node.minItems;
  let arr = z.array(z.unknown());
  if (min != null && min > 0) arr = arr.min(min, m.minItems(labelOf(node), min));
  if (node.maxItems != null) arr = arr.max(node.maxItems, m.maxItems(labelOf(node), node.maxItems));

  const checked = arr.superRefine((rows, ctx) => {
    rows.forEach((row, i) => {
      const rowObj = (row ?? {}) as Record<string, unknown>;
      const res = rowShape(node, rowObj, values, m, access).safeParse(rowObj);
      if (!res.success) {
        for (const issue of res.error.issues) {
          ctx.addIssue({ ...issue, path: [i, ...issue.path] });
        }
      }
    });
  });

  // Re-parse each row so reaction/visibility-hidden keys are stripped from the clean
  // output, mirroring how top-level hidden fields are stripped.
  const stripped = checked.transform((rows) =>
    (rows as unknown[]).map((row) => {
      const rowObj = (row ?? {}) as Record<string, unknown>;
      const res = rowShape(node, rowObj, values, m, access).safeParse(rowObj);
      return res.success ? res.data : rowObj;
    }),
  );

  return min ? stripped : stripped.optional();
}

/** Build the Zod shape for a list of nodes against `values` (drives visibility) and
 *  optional `access` (drives RBAC). Recurses into groups (their children join this
 *  flat shape) and arrays (compiled to a nested array-of-objects). */
function buildShape(
  nodes: FieldNode[],
  values: Record<string, unknown>,
  m: ValidationMessages,
  access?: AccessContext,
  effects?: EffectMap,
): z.ZodRawShape {
  const shape: z.ZodRawShape = {};
  for (const node of nodes) {
    // Reaction `visible` effects override `visibleWhen`, so a reaction-hidden field
    // drops out of validation (and a reaction-shown field opts back in) consistently
    // with how the renderer paints it. `effects` is the scope's EffectMap.
    if (!effectiveVisible(node, values, effects)) continue;
    if (access && !canView(node, access)) continue;
    if (isLayoutContainer(node)) {
      // Layout containers (group/tabs/card/...) are transparent for values:
      // their children hoist into this flat shape. A container hidden above
      // (visibleWhen / RBAC) was already skipped, hiding its whole subtree.
      Object.assign(shape, buildShape(node.children, values, m, access, effects));
      continue;
    }
    // A `display-text` node is a value-LESS leaf (static authored content); it is not a
    // layout container, so without this skip the leaf fallback below would wrongly try to
    // read `node.name` and add a zod field for it.
    if (node.type === "display-text") continue;
    if (node.type === "array") {
      shape[node.name] = arrayZod(node, values, m, access);
      continue;
    }
    // A reaction `required` effect for this field overrides its static required-ness,
    // staying consistent with what the renderer shows (per-row arrays pass rowEffects).
    shape[node.name] = withCrossChecks(
      leafZod(node, m, effects?.[node.name]?.required),
      node,
      values,
      m,
    );
  }
  return shape;
}

/** Wrap a leaf schema with its error-severity `cross` assertions, evaluated via SAFE
 *  JSONLogic against the SCOPE values this shape was built for (the merged
 *  `{...outer, ...row}` object inside an array row, the form values at the top level).
 *  Field-level on purpose: the issue lands on this field's path for free, and per-row
 *  scope costs nothing since `rowShape` already rebuilds the shape per row. Cross
 *  issues only surface once the field's own base schema parses (one error per field).
 *  Warning-severity cross rules are handled by `collectWarnings` instead. */
function withCrossChecks(
  schema: z.ZodTypeAny,
  node: LeafField,
  values: Record<string, unknown>,
  m: ValidationMessages,
): z.ZodTypeAny {
  const cross = (node.validations ?? []).filter(
    (r) => r.type === "cross" && r.rule && ruleSeverity(r) === "error",
  );
  if (cross.length === 0) return schema;
  return schema.superRefine((_v, ctx) => {
    for (const r of cross) {
      if (!evalRule(r.rule as Record<string, unknown>, values)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: r.message ?? m.invalid(labelOf(node)),
        });
      }
    }
  });
}

/**
 * Build a Zod schema from a FormSchema. Reusable cross-platform: web and native
 * both validate against the SAME shape. Fields hidden by `visibleWhen` (or, when
 * `access` is supplied, by RBAC) are excluded, so they never block submit and are
 * stripped from the parsed output. Groups contribute their children to the flat
 * value object — group nodes hold no value of their own. Array nodes hold a nested
 * array-of-objects value keyed by their item fields.
 */
export function buildZodSchema(
  form: FormSchema,
  opts: BuildZodOptions = {},
): z.ZodObject<z.ZodRawShape> {
  const values = opts.values ?? {};
  const m = opts.messages ?? enMessages;
  // Reactions are computed internally so the signature is unchanged and validation
  // stays automatically consistent with what the renderer shows. Top-level scope only;
  // per-row array effects are applied inside arrayZod in G4.
  const effects = computeReactions(form, values);
  return z.object(buildShape(form.fields, values, m, opts.access, effects));
}

/** Walk every VISIBLE leaf, mirroring `buildShape`'s skip logic exactly (visibility,
 *  RBAC, transparent containers, per-row merged scope + per-row reactions for arrays).
 *  LOCKSTEP: any change to buildShape's traversal must be repeated here, or warnings/
 *  async checks will disagree with the blocking schema about which fields exist.
 *  `path` is the dotted react-hook-form path (`arr.0.field` inside rows). */
function walkLeaves(
  nodes: FieldNode[],
  values: Record<string, unknown>,
  access: AccessContext | undefined,
  effects: EffectMap | undefined,
  prefix: string,
  visit: (node: LeafField, path: string, scope: Record<string, unknown>) => void,
): void {
  for (const node of nodes) {
    if (!effectiveVisible(node, values, effects)) continue;
    if (access && !canView(node, access)) continue;
    if (isLayoutContainer(node)) {
      walkLeaves(node.children, values, access, effects, prefix, visit);
      continue;
    }
    // Value-less display node — never a leaf with a value (mirrors buildShape's skip).
    if (node.type === "display-text") continue;
    if (node.type === "array") {
      const rows = values[node.name];
      if (!Array.isArray(rows)) continue;
      rows.forEach((row, i) => {
        const rowObj = (row ?? {}) as Record<string, unknown>;
        const merged = { ...values, ...rowObj };
        const rowEffects = computeNodeReactions(node.itemFields, merged);
        walkLeaves(
          node.itemFields,
          merged,
          access,
          rowEffects,
          `${prefix}${node.name}.${i}.`,
          visit,
        );
      });
      continue;
    }
    visit(node, `${prefix}${node.name}`, values);
  }
}

/**
 * Collect NON-BLOCKING validation warnings: every visible leaf's warning-severity
 * rules, evaluated against current values. Returns dotted react-hook-form paths
 * (`arr.0.field` inside array rows) → the first violated warning's message.
 * Plain rules run through the SAME `leafZodWith` compiler as the blocking path
 * (no drift); `cross` warnings evaluate their JSONLogic assertion against the
 * leaf's scope. The static `required` flag stays on the blocking path — only a
 * warning-severity `required` RULE warns about emptiness.
 */
export function collectWarnings(
  form: FormSchema,
  values: Record<string, unknown> = {},
  access?: AccessContext,
  messages?: ValidationMessages,
): Record<string, string> {
  const out: Record<string, string> = {};
  const m = messages ?? enMessages;
  const effects = computeReactions(form, values);
  walkLeaves(form.fields, values, access, effects, "", (node, path, scope) => {
    const warn = (node.validations ?? []).filter((r) => ruleSeverity(r) === "warning");
    if (warn.length === 0) return;
    const plain = warn.filter((r) => r.type !== "cross");
    if (plain.length > 0) {
      const schema = leafZodWith(
        node,
        plain,
        m,
        plain.some((r) => r.type === "required"),
      );
      const res = schema.safeParse(scope[node.name], { errorMap: m.errorMap });
      if (!res.success) {
        const msg = res.error.issues[0]?.message;
        if (msg) out[path] ??= msg;
      }
    }
    for (const r of warn) {
      if (r.type !== "cross" || !r.rule) continue;
      if (!evalRule(r.rule as Record<string, unknown>, scope)) {
        out[path] ??= r.message ?? m.invalid(labelOf(node));
      }
    }
  });
  return out;
}

/** One visible leaf carrying an `asyncValidator`: its dotted react-hook-form `path`
 *  (rows included) and its bare schema `name` (sent as the `name` query param). */
export interface AsyncFieldTarget {
  path: string;
  name: string;
  validator: AsyncValidator;
}

/** Every visible leaf with an `asyncValidator`, honoring the same visibility/RBAC
 *  walk as the blocking schema, so hidden fields never fire remote checks. */
export function collectAsyncFields(
  form: FormSchema,
  values: Record<string, unknown> = {},
  access?: AccessContext,
): AsyncFieldTarget[] {
  const out: AsyncFieldTarget[] = [];
  const effects = computeReactions(form, values);
  walkLeaves(form.fields, values, access, effects, "", (node, path) => {
    if (node.asyncValidator) out.push({ path, name: node.name, validator: node.asyncValidator });
  });
  return out;
}
