import type { FieldNode, FormSchema, LeafField } from "@org/form-schema";
import { z } from "zod";
import { isVisible } from "./conditions.js";
import { type AccessContext, canView } from "./rbac.js";

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
  const required = node.required === true;
  const requiredMsg = `${labelOf(node)} is required`;

  switch (node.type) {
    case "text":
    case "textarea":
    case "password": {
      // When required, an undefined/empty value must surface the same message,
      // so set the type-error too (z.string() otherwise reports "Required").
      let s = required
        ? z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
        : z.string();
      if (node.maxLength != null) s = s.max(node.maxLength);
      return required ? s.min(1, requiredMsg) : s.optional();
    }
    case "number":
    case "slider":
    case "rate": {
      let s = z.number({ required_error: requiredMsg, invalid_type_error: requiredMsg });
      if (node.type !== "rate") {
        if (node.min != null) s = s.min(node.min);
        if (node.max != null) s = s.max(node.max);
      }
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
      // A color is a string (hex/rgb); only presence is asserted when required.
      const s = required
        ? z.string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
        : z.string();
      return required ? s.min(1, requiredMsg) : s.optional();
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

/**
 * Build a Zod schema from a FormSchema. Reusable cross-platform: web and native
 * both validate against the SAME shape. Fields hidden by `visibleWhen` (or, when
 * `access` is supplied, by RBAC) are excluded, so they never block submit and are
 * stripped from the parsed output. Groups contribute their children to the flat
 * value object — group nodes hold no value of their own.
 */
export function buildZodSchema(
  form: FormSchema,
  opts: BuildZodOptions = {},
): z.ZodObject<z.ZodRawShape> {
  const values = opts.values ?? {};
  const shape: z.ZodRawShape = {};

  const walk = (nodes: FieldNode[]): void => {
    for (const node of nodes) {
      if (!isVisible(node, values)) continue;
      if (opts.access && !canView(node, opts.access)) continue;
      if (node.type === "group") {
        walk(node.children);
        continue;
      }
      shape[node.name] = leafZod(node);
    }
  };

  walk(form.fields);
  return z.object(shape);
}
