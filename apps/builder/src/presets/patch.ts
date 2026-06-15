import type { FieldNode, Preset } from "@org/form-schema";

/**
 * patch.ts — distil a concrete field into a reusable preset.
 *
 * A preset's `patch` is the field's authorable shape with the *instance-identity* keys
 * removed: `name` (the builder re-seeds a fresh, unique one) and `type` (carried on the
 * preset envelope). Applied later as `newField(fieldType, taken, patch)`.
 */

const INSTANCE_KEYS = new Set(["type", "name"]);

/** Every authorable prop of a field except the instance-identity keys (and `undefined`s). */
export function presetPatchFromField(field: FieldNode): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(field)) {
    if (INSTANCE_KEYS.has(key) || value === undefined) continue;
    patch[key] = value;
  }
  return patch;
}

/** Build a user preset from the selected field. The icon defaults to the field's prefix
 *  (then suffix) icon token when present, so a "Search input" carries its glyph. */
export function presetFromField(name: string, field: FieldNode): Preset {
  const patch = presetPatchFromField(field);
  const icon =
    (typeof patch.prefixIcon === "string" ? patch.prefixIcon : undefined) ??
    (typeof patch.suffixIcon === "string" ? patch.suffixIcon : undefined);
  return {
    id: `user-${Date.now()}`,
    fieldType: field.type,
    name: name.trim() || "Untitled preset",
    icon,
    patch,
  };
}
