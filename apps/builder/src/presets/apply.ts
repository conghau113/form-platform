import type { FieldNode, FormSchema, Preset } from "@org/form-schema";
import { type FieldType, newField } from "../field-registry";
import { linkPatch } from "./link";

/**
 * apply.ts — append a preset into a form as a **linked field** (Track W4).
 *
 * This is what powers "apply a preset across the project": for each target form we
 * seed a fresh field of the preset's type, carrying `presetId` + the preset `patch`
 * as a snapshot (and empty `overrides`). Because the field is *linked*, a later edit
 * to the preset re-propagates through form-core's `resolveLinkedFields`. Pure: returns
 * a new form, never mutates the input. The batch IO (load → append → save per form)
 * lives in `useApplyPreset`.
 */

/** Every `name` reachable in a form's field tree (children + array rows), for uniqueness. */
export function collectFieldNames(fields: readonly FieldNode[]): Set<string> {
  const names = new Set<string>();
  const walk = (nodes: readonly unknown[]): void => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const obj = node as Record<string, unknown>;
      if (typeof obj.name === "string") names.add(obj.name);
      if (Array.isArray(obj.children)) walk(obj.children);
      if (Array.isArray(obj.itemFields)) walk(obj.itemFields);
    }
  };
  walk(fields);
  return names;
}

/** Append the preset to `form` as a new linked field with a name unique to that form. */
export function appendLinkedField(form: FormSchema, preset: Preset): FormSchema {
  const taken = collectFieldNames(form.fields);
  const field = newField(preset.fieldType as FieldType, taken, linkPatch(preset));
  return { ...form, fields: [...form.fields, field] };
}
