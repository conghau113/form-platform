import type { Preset } from "@org/form-schema";

/**
 * Persistence boundary for presets. W0 keeps the API on the P1 `Preset` shape (no behaviour
 * change); the repo supplies the DB-only `scope`/`ownerId`/`projectId` defaults (global) and
 * strips them on read. W3 widens this with explicit scope/project filtering.
 */
export abstract class PresetRepo {
  /** All saved presets, in the P1 contract shape. */
  abstract list(): Promise<Preset[]>;
  /** Validate-then-store happens in the service; this upserts the normalized preset by id. */
  abstract upsert(preset: Preset): Promise<Preset>;
  /** Remove by id; resolves `false` when nothing was deleted (service maps false → 404). */
  abstract remove(id: string): Promise<boolean>;
}
