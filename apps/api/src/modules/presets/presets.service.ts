import { Injectable, NotFoundException } from "@nestjs/common";
import { type Preset, parsePreset } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PresetRepo } from "../../persistence/repositories/preset.repo.js";

/**
 * Preset store, sibling to FormsService/ThemesService. W0 keeps the library global (no
 * user/auth scope yet); W3 adds per-project scope. The server is the source of truth: every
 * saved body is run through `parsePreset` (validate) before it reaches the repo.
 */
@Injectable()
export class PresetsService {
  constructor(private readonly presets: PresetRepo) {}

  /** All saved user presets (built-in presets ship in the builder, not here). */
  list(): Promise<Preset[]> {
    return this.presets.list();
  }

  /** Validate and upsert a preset by id; returns the normalized preset. */
  save(body: unknown): Promise<Preset> {
    const preset = parsePreset(body); // validates; throws on invalid
    return this.presets.upsert(preset);
  }

  /** Remove a preset by id → 404 if it does not exist. */
  async remove(id: string): Promise<void> {
    assertId(id, "preset");
    const removed = await this.presets.remove(id);
    if (!removed) throw new NotFoundException(`Preset not found: ${id}`);
  }
}
