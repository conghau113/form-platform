import {
  type ArrayField,
  type FieldNode,
  type FormSchema,
  isLayoutContainer,
  type LeafField,
  type ValidationRule,
} from "@org/form-schema";
import { z } from "zod";
import { type AccessContext, canView } from "./rbac.js";
import { computeReactions, type EffectMap, effectiveVisible } from "./reactions.js";

/** A lenient phone matcher: optional leading +, then 7–15 digits, allowing spaces,
 *  dashes and parens as separators. Compiled from a string literal — never eval. */
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,18}[0-9]$/;

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
 *  string. `required` is handled by the caller (it gates optional vs presence). */
function applyStringRules(s: z.ZodString, rules: ValidationRule[]): z.ZodString {
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
      case "format":
        if (r.format === "email") out = out.email(r.message);
        else if (r.format === "url") out = out.url(r.message);
        else if (r.format === "phone")
          out = out.regex(PHONE_RE, r.message ?? "Invalid phone number");
        break;
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
}

function labelOf(node: { label?: string; name: string }): string {
  return node.label?.trim() ? node.label : node.name;
}

/** Map one leaf field to a Zod type, honoring required + per-type constraints. */
function leafZod(node: LeafField): z.ZodTypeAny {
  const rules = node.validations ?? [];
  const requiredRule = rules.find((r) => r.type === "required");
  // The `required` flag and a `required` validation rule are equivalent; either
  // one makes the field mandatory. A rule's `message` customizes the text.
  const required = node.required === true || requiredRule != null;
  const requiredMsg = requiredRule?.message ?? `${labelOf(node)} is required`;

  switch (node.type) {
    case "text":
    case "textarea":
    case "password": {
      // When required, an undefined/empty value must surface the same message,
      // so set the type-error too (z.string() otherwise reports "Required").
      let s = z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg });
      if (node.maxLength != null) s = s.max(node.maxLength);
      s = applyStringRules(s, rules);
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
    case "color": {
      // A color is a string (hex/rgb); presence is asserted when required, plus any
      // string rules (e.g. a pattern enforcing a hex shape).
      let s = z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg });
      s = applyStringRules(s, rules);
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
  }
}

/** Compile an `array` (Form List) node to a Zod array of row objects. The item
 *  schema is built from `itemFields` treating them as always-visible: a single static
 *  schema can't model per-row `visibleWhen` (the row's own values aren't known here).
 *  KNOWN LIMITATION — candidate for Phase F reactions. `required` implies minItems 1. */
function arrayZod(node: ArrayField, access?: AccessContext): z.ZodTypeAny {
  const item = z.object(buildShape(node.itemFields, {}, access));
  let arr = z.array(item);
  // `required` means ≥1; when both are set the stricter bound wins, so an explicit
  // `minItems: 0` never silently cancels `required: true`.
  const min = node.required ? Math.max(node.minItems ?? 0, 1) : node.minItems;
  if (min != null && min > 0)
    arr = arr.min(min, `${labelOf(node)} requires at least ${min} item(s)`);
  if (node.maxItems != null)
    arr = arr.max(node.maxItems, `${labelOf(node)} allows at most ${node.maxItems} item(s)`);
  return min ? arr : arr.optional();
}

/** Build the Zod shape for a list of nodes against `values` (drives visibility) and
 *  optional `access` (drives RBAC). Recurses into groups (their children join this
 *  flat shape) and arrays (compiled to a nested array-of-objects). */
function buildShape(
  nodes: FieldNode[],
  values: Record<string, unknown>,
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
      Object.assign(shape, buildShape(node.children, values, access, effects));
      continue;
    }
    if (node.type === "array") {
      shape[node.name] = arrayZod(node, access);
      continue;
    }
    shape[node.name] = leafZod(node);
  }
  return shape;
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
  // Reactions are computed internally so the signature is unchanged and validation
  // stays automatically consistent with what the renderer shows. Top-level scope only;
  // per-row array effects are applied inside arrayZod in G4.
  const effects = computeReactions(form, values);
  return z.object(buildShape(form.fields, values, opts.access, effects));
}
