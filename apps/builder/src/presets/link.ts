import type { PresetLike, PresetResolver } from "@org/form-core";
import type { FieldNode, Preset } from "@org/form-schema";

/**
 * link.ts — builder-side helpers for **linked fields** (Track W4).
 *
 * A linked field references a {@link Preset} by id and carries its *resolved* props (a
 * snapshot) plus an `overrides` record of the keys where this instance diverges from the
 * preset. form-core's `resolveLinkedFields` re-applies `patch` then `overrides` at render
 * time; these helpers produce the patches the PropertyPanel commits, and keep `overrides`
 * in sync as the field is edited.
 */

// Keys that are NOT authorable props to diff: instance identity + the link metadata itself.
const NON_OVERRIDE_KEYS = new Set(["type", "name", "presetId", "overrides"]);

/** Structural deep-equal over JSON-serialisable authored values (primitives/arrays/objects).
 *  Order-stable because both sides come from the same authoring construction. */
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The shallow diff of a field's authored props against the linked preset's `patch`: the keys
 * where this instance diverges (different value, or a key the preset doesn't define). This is
 * what gets persisted as `overrides` so the renderer can reproduce the instance from the
 * preset without the builder.
 */
export function computeOverrides(
  field: FieldNode,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(field)) {
    if (NON_OVERRIDE_KEYS.has(key) || value === undefined) continue;
    if (!jsonEqual(value, patch[key])) overrides[key] = value;
  }
  return overrides;
}

/** Patch applied when linking a field to a preset: adopt the preset's props as the snapshot,
 *  set the link, and start with no local overrides. */
export function linkPatch(preset: Preset): Record<string, unknown> {
  return { ...preset.patch, presetId: preset.id, overrides: {} };
}

/** Patch applied when unlinking: drop the link metadata, keep the current props as a plain
 *  field. `patchNodeAtPath` shallow-merges, so `undefined` clears the keys on serialise. */
export const UNLINK_PATCH: Record<string, unknown> = { presetId: undefined, overrides: undefined };

/** Build a {@link PresetResolver} (for `FormRenderer`'s `presetResolver`) from a flat list. */
export function presetResolverFromList(presets: Preset[]): PresetResolver {
  const byId = new Map<string, PresetLike>();
  for (const p of presets) byId.set(p.id, { fieldType: p.fieldType, patch: p.patch });
  return (id) => byId.get(id);
}
