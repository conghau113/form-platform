import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type Preset, parsePreset } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PresetRepo } from "../../persistence/repositories/preset.repo.js";

/**
 * Preset store, sibling to FormsService/ThemesService. Owner- and scope-aware (W3): a preset
 * is global (every project) or scoped to one project; the library a project sees is
 * `global ∪ thisProject`. The server is the source of truth: every saved body is run through
 * `parsePreset` (validate, incl. the scope/projectId invariant) before it reaches the repo.
 */
@Injectable()
export class PresetsService {
  constructor(private readonly presets: PresetRepo) {}

  /** Global presets for the owner, plus `projectId`'s presets when given (built-ins ship in FE). */
  list(ownerId: string, projectId?: string): Promise<Preset[]> {
    return this.presets.list(ownerId, projectId);
  }

  /** Validate and upsert a preset by id under the owner; returns the normalized preset.
   *  A preset id already owned by someone else → 409 (ids are a global PK; never silently
   *  overwrite another owner's row). */
  async save(ownerId: string, body: unknown): Promise<Preset> {
    const preset = parsePreset(body); // validates; throws on invalid
    const existingOwner = await this.presets.findOwner(preset.id);
    if (existingOwner && existingOwner !== ownerId) {
      throw new ConflictException(`Preset id already in use: ${preset.id}`);
    }
    return this.presets.upsert(ownerId, preset);
  }

  /** Remove a preset by id → 404 if it does not exist for this owner. */
  async remove(ownerId: string, id: string): Promise<void> {
    assertId(id, "preset");
    const removed = await this.presets.remove(ownerId, id);
    if (!removed) throw new NotFoundException(`Preset not found: ${id}`);
  }

  /** Promote a project preset to global → 404 if it does not exist for this owner. */
  async promote(ownerId: string, id: string): Promise<Preset> {
    assertId(id, "preset");
    const promoted = await this.presets.promote(ownerId, id);
    if (!promoted) throw new NotFoundException(`Preset not found: ${id}`);
    return promoted;
  }
}
