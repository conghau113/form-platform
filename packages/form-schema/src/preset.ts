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
/**
 * Where a preset is visible (Track W3). `"global"` presets show in every project;
 * `"project"` presets show only inside their {@link Preset.projectId}. Absent ⇒ `"global"`
 * (back-compat with P1 bodies). This is organisational metadata — it lives on the preset,
 * NOT inside any form contract, so it never touches `CURRENT_FORM_VERSION`.
 */
export type PresetScope = "global" | "project";

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
  /** Visibility scope (Track W3). Absent ⇒ global. */
  scope?: PresetScope;
  /** Owning project — required iff `scope === "project"`; ignored/cleared otherwise. */
  projectId?: string;
}

/**
 * Validator for the preset envelope. `fieldType` is checked as a non-empty string (kept
 * loosely coupled so new field types stay valid without editing this); `patch` is an
 * opaque record — its contents are NOT cross-validated against the field type here.
 * `scope`/`projectId` are optional (W3): a `"project"` preset must carry a `projectId`.
 */
export const presetSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "id must be a simple identifier"),
    fieldType: z.string().min(1) as z.ZodType<FieldNode["type"]>,
    name: z.string().min(1),
    icon: z.string().optional(),
    patch: z.record(z.string(), z.unknown()),
    scope: z.enum(["global", "project"]).optional(),
    projectId: z.string().min(1).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.scope === "project" && !val.projectId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projectId is required when scope is 'project'",
        path: ["projectId"],
      });
    }
  }) satisfies z.ZodType<Preset>;

/** Validate an unknown body as a {@link Preset}; throws on invalid (mirrors `migrate`). */
export function parsePreset(body: unknown): Preset {
  return presetSchema.parse(body);
}
