import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Injectable, NotFoundException } from "@nestjs/common";
import { type Preset, parsePreset } from "@org/form-schema";
import { assertId, DATA_DIR, ensureDataDir } from "../../common/file-store.js";

/**
 * File-backed preset store, sibling to FormsService/ThemesService. Unlike forms/themes
 * (one file per id), presets are a single shared collection in `<DATA_DIR>/presets.json`.
 * There is no user/auth scope yet, so the library is global. The server is the source of
 * truth: every saved body is run through `parsePreset` (validate) before it lands on disk.
 */
@Injectable()
export class PresetsService {
  private readonly file = resolve(DATA_DIR, "presets.json");

  /** All saved user presets (built-in presets ship in the builder, not here). */
  list(): Preset[] {
    if (!existsSync(this.file)) return [];
    return JSON.parse(readFileSync(this.file, "utf8")) as Preset[];
  }

  /** Validate and upsert a preset by id; returns the normalized preset. */
  save(body: unknown): Preset {
    const preset = parsePreset(body); // validates; throws on invalid
    const presets = this.list().filter((p) => p.id !== preset.id);
    presets.push(preset);
    this.write(presets);
    return preset;
  }

  /** Remove a preset by id → 404 if it does not exist. */
  remove(id: string): void {
    assertId(id, "preset");
    const presets = this.list();
    const next = presets.filter((p) => p.id !== id);
    if (next.length === presets.length) throw new NotFoundException(`Preset not found: ${id}`);
    this.write(next);
  }

  private write(presets: Preset[]): void {
    ensureDataDir();
    writeFileSync(this.file, JSON.stringify(presets, null, 2), "utf8");
  }
}
