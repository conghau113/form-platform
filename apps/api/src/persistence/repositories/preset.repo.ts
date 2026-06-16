import type { Preset } from "@org/form-schema";

/**
 * Persistence boundary for presets. Owner- and scope-aware (W3): every row is scoped to an
 * `ownerId`, and a preset is either `scope:"global"` (visible in every project) or
 * `scope:"project"` (visible only in its `projectId`). Validation (incl. the scope/projectId
 * invariant) happens in the service via `parsePreset`; the repo persists the normalized preset.
 */
export abstract class PresetRepo {
  /** Global presets for `ownerId`, plus this `projectId`'s presets when one is given. */
  abstract list(ownerId: string, projectId?: string): Promise<Preset[]>;
  /** The owner of the preset with this id, or `null` if no such preset exists. */
  abstract findOwner(id: string): Promise<string | null>;
  /** Upsert the normalized preset by id under `ownerId` (scope/projectId taken from the preset). */
  abstract upsert(ownerId: string, preset: Preset): Promise<Preset>;
  /** Remove by id (scoped to `ownerId`); `false` when nothing was deleted (service maps → 404). */
  abstract remove(ownerId: string, id: string): Promise<boolean>;
  /** Promote a preset to global (`scope:"global"`, `projectId:null`); `null` when missing. */
  abstract promote(ownerId: string, id: string): Promise<Preset | null>;
}
