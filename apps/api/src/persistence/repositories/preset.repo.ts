import type { Preset, PresetScope } from "@org/form-schema";

/** Identity of a stored preset row, enough for the service to route access/ownership. */
export interface PresetMeta {
  ownerId: string;
  scope: PresetScope;
  projectId: string | null;
}

/** A project's identity for listing its shared presets: which project, owned by whom. */
export interface PresetProjectScope {
  id: string;
  ownerId: string;
}

/**
 * Persistence boundary for presets. Owner- and scope-aware (W3): every row is scoped to an
 * `ownerId`, and a preset is either `scope:"global"` (visible in every project) or
 * `scope:"project"` (visible only in its `projectId`). Validation (incl. the scope/projectId
 * invariant) happens in the service via `parsePreset`; the repo persists the normalized preset.
 *
 * Project presets are a *shared* project library (W5 follow-up): they are stored under the
 * project's owner, so every collaborator who can see the project sees the same library. The
 * service decides the effective `ownerId` (global = the user; project = the project owner) and
 * gates it through `ProjectsService`; the repo stays a thin owner-scoped store.
 */
export abstract class PresetRepo {
  /**
   * The user's global presets, plus a project's shared presets when `project` is given.
   * Global rows are owned by `userId`; project rows are owned by `project.ownerId`.
   */
  abstract list(userId: string, project?: PresetProjectScope): Promise<Preset[]>;
  /** The stored identity of the preset with this id, or `null` if no such preset exists. */
  abstract findMeta(id: string): Promise<PresetMeta | null>;
  /** Upsert the normalized preset by id under `ownerId` (scope/projectId taken from the preset). */
  abstract upsert(ownerId: string, preset: Preset): Promise<Preset>;
  /** Remove by id (scoped to `ownerId`); `false` when nothing was deleted (service maps → 404). */
  abstract remove(ownerId: string, id: string): Promise<boolean>;
  /** Promote a preset to global (`scope:"global"`, `projectId:null`); `null` when missing. */
  abstract promote(ownerId: string, id: string): Promise<Preset | null>;
}
