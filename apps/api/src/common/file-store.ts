import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { NotFoundException } from "@nestjs/common";

/**
 * Shared file-backed storage helpers for the feature services. The server is the
 * source of truth: a form and its theme live side by side under `<id>.json` /
 * `<id>.theme.json` in this directory.
 */
export const DATA_DIR = resolve(process.cwd(), ".data");

/** Resolve the on-disk path for `<id><suffix>`, guarding against path traversal —
 *  ids are simple identifiers. A bad id throws NotFound (`label` names the entity). */
export function dataFile(id: string, suffix: string, label: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new NotFoundException(`Invalid ${label} id: ${id}`);
  return resolve(DATA_DIR, `${id}${suffix}`);
}

/** Create the data directory if it does not exist yet (idempotent). */
export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}
