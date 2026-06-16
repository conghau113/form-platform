import { resolve } from "node:path";
import { NotFoundException } from "@nestjs/common";

/**
 * Root of the legacy flat-file data. Persistence now lives in the DB (see `persistence/`), but
 * the one-shot importer (`scripts/import-files-to-db.ts`) still reads the old `<id>.json` /
 * `<id>.theme.json` / `presets.json` from here, and the SQLite db file lives here too.
 */
export const DATA_DIR = resolve(process.cwd(), ".data");

/** Guard an id against unexpected characters — a bad id throws NotFound (`label` names the
 *  entity). Kept as the shared id-shape check across the feature services. */
export function assertId(id: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new NotFoundException(`Invalid ${label} id: ${id}`);
}
