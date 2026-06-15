import { z } from "zod";
import type { FieldNode } from "./schema.js";

/**
 * A **preset**: a named, reusable field template. It is the persisted, richer cousin of
 * the in-app `PaletteVariant` — a schema `fieldType` plus a `patch` of default props (and
 * an optional icon) that the builder applies when seeding a new field.
 *
 * IMPORTANT: a preset is **authoring metadata, not form JSON**. It is decoupled from
 * `CURRENT_FORM_VERSION` (changing this shape never requires a formVersion bump or a
 * migration). `patch` is opaque declarative data — never eval'd; the builder merges it
 * into a freshly seeded node.
 */
export interface Preset {
  /** Stable id (also the storage key). Simple identifier, e.g. `"builtin-search"`. */
  id: string;
  /** The schema field type this preset seeds (e.g. `"text"`, `"number"`). */
  fieldType: FieldNode["type"];
  /** Human label shown in the palette/gallery. */
  name: string;
  /** Optional icon token resolved by the renderer registry, e.g. `"antd:SearchOutlined"`. */
  icon?: string;
  /** Default props merged into the seeded node (e.g. `{ placeholder: "Search" }`). */
  patch: Record<string, unknown>;
}

/**
 * Validator for the preset envelope. `fieldType` is checked as a non-empty string (kept
 * loosely coupled so new field types stay valid without editing this); `patch` is an
 * opaque record — its contents are NOT cross-validated against the field type here.
 */
export const presetSchema: z.ZodType<Preset> = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "id must be a simple identifier"),
  fieldType: z.string().min(1) as z.ZodType<FieldNode["type"]>,
  name: z.string().min(1),
  icon: z.string().optional(),
  patch: z.record(z.string(), z.unknown()),
});

/** Validate an unknown body as a {@link Preset}; throws on invalid (mirrors `migrate`). */
export function parsePreset(body: unknown): Preset {
  return presetSchema.parse(body);
}
