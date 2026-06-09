import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Injectable, NotFoundException } from "@nestjs/common";
import { type DesignTokens, migrateTheme } from "@org/form-theme";

/**
 * File-backed theme store, sibling to FormsService. A theme is persisted
 * alongside its form under the SAME id (`<id>.theme.json`), so loading a form
 * can reapply its saved look. The server is the source of truth: every body is
 * run through `migrateTheme` (validate + normalize) before it lands on disk.
 */
@Injectable()
export class ThemesService {
  private readonly dataDir = resolve(process.cwd(), ".data");

  private fileFor(id: string): string {
    // Guard against path traversal; ids are simple form identifiers.
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new NotFoundException(`Invalid theme id: ${id}`);
    return resolve(this.dataDir, `${id}.theme.json`);
  }

  save(id: string, body: unknown): DesignTokens {
    const theme = migrateTheme(body); // validates + normalizes to CURRENT_THEME_VERSION
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    writeFileSync(this.fileFor(id), JSON.stringify(theme, null, 2), "utf8");
    return theme;
  }

  load(id: string): DesignTokens {
    const file = this.fileFor(id);
    if (!existsSync(file)) throw new NotFoundException(`Theme not found: ${id}`);
    return JSON.parse(readFileSync(file, "utf8")) as DesignTokens;
  }
}
