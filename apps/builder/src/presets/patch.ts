import type { FieldNode, Preset, PresetScope } from "@org/form-schema";

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
 *  (then suffix) icon token when present, so a "Search input" carries its glyph. `scope`
 *  (W3) defaults to global; pass `{ scope: "project", projectId }` to scope it to a project. */
export function presetFromField(
  name: string,
  field: FieldNode,
  scope?: { scope: PresetScope; projectId?: string },
): Preset {
  const patch = presetPatchFromField(field);
  const icon =
    (typeof patch.prefixIcon === "string" ? patch.prefixIcon : undefined) ??
    (typeof patch.suffixIcon === "string" ? patch.suffixIcon : undefined);
  return {
    // Unique per save (a UUID, not a timestamp) so two presets saved in the same tick can't
    // collide on id and overwrite each other. Hyphens are within the preset-id charset.
    id: `user-${crypto.randomUUID()}`,
    fieldType: field.type,
    name: name.trim() || "Untitled preset",
    icon,
    patch,
    ...(scope ?? {}),
  };
}
