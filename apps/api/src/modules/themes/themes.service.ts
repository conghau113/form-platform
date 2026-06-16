import { Injectable, NotFoundException } from "@nestjs/common";
import { type DesignTokens, migrateTheme } from "@org/form-theme";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ThemeRepo } from "../../persistence/repositories/theme.repo.js";

/**
 * Theme store, sibling to FormsService. A theme is persisted against its form's id, so
 * loading a form can reapply its saved look. The server is the source of truth: every body is
 * run through `migrateTheme` (validate + normalize) before it reaches the repo.
 */
@Injectable()
export class ThemesService {
  constructor(private readonly themes: ThemeRepo) {}

  save(id: string, body: unknown): Promise<DesignTokens> {
    assertId(id, "theme");
    const theme = migrateTheme(body); // validates + normalizes to CURRENT_THEME_VERSION
    return this.themes.upsert(id, theme);
  }

  async load(id: string): Promise<DesignTokens> {
    assertId(id, "theme");
    const tokens = await this.themes.load(id);
    if (!tokens) throw new NotFoundException(`Theme not found: ${id}`);
    return tokens;
  }
}
