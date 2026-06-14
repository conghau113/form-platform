import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Injectable, NotFoundException } from "@nestjs/common";
import { type DesignTokens, migrateTheme } from "@org/form-theme";
import { dataFile, ensureDataDir } from "../../common/file-store.js";

/**
 * File-backed theme store, sibling to FormsService. A theme is persisted
 * alongside its form under the SAME id (`<id>.theme.json`), so loading a form
 * can reapply its saved look. The server is the source of truth: every body is
 * run through `migrateTheme` (validate + normalize) before it lands on disk.
 */
@Injectable()
export class ThemesService {
  private fileFor(id: string): string {
    return dataFile(id, ".theme.json", "theme");
  }

  save(id: string, body: unknown): DesignTokens {
    const theme = migrateTheme(body); // validates + normalizes to CURRENT_THEME_VERSION
    ensureDataDir();
    writeFileSync(this.fileFor(id), JSON.stringify(theme, null, 2), "utf8");
    return theme;
  }

  load(id: string): DesignTokens {
    const file = this.fileFor(id);
    if (!existsSync(file)) throw new NotFoundException(`Theme not found: ${id}`);
    return JSON.parse(readFileSync(file, "utf8")) as DesignTokens;
  }
}
