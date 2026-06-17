import { Injectable, NotFoundException } from "@nestjs/common";
import { type DesignTokens, migrateTheme } from "@org/form-theme";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ThemeRepo } from "../../persistence/repositories/theme.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/**
 * Theme store, sibling to FormsService. A theme is persisted against its form's id, so
 * loading a form can reapply its saved look. The server is the source of truth: every body is
 * run through `migrateTheme` (validate + normalize) before it reaches the repo.
 *
 * Access mirrors the form's: a theme is keyed by a form id, so it inherits that form's project
 * role gate (Track W; W5 follow-up). Read = viewer, write = editor; an unknown form id → 404.
 * Without this, `/themes/:id` would let any caller read or overwrite any form's theme.
 */
@Injectable()
export class ThemesService {
  constructor(
    private readonly themes: ThemeRepo,
    private readonly forms: FormRepo,
    private readonly projects: ProjectsService,
  ) {}

  async save(ownerId: string, id: string, body: unknown): Promise<DesignTokens> {
    assertId(id, "theme");
    await this.requireFormAccess(ownerId, id, "editor");
    const theme = migrateTheme(body); // validates + normalizes to CURRENT_THEME_VERSION
    return this.themes.upsert(id, theme);
  }

  async load(ownerId: string, id: string): Promise<DesignTokens> {
    assertId(id, "theme");
    await this.requireFormAccess(ownerId, id, "viewer");
    const tokens = await this.themes.load(id);
    if (!tokens) throw new NotFoundException(`Theme not found: ${id}`);
    return tokens;
  }

  /** A theme is keyed by its form's id, so it inherits the form's project access gate. */
  private async requireFormAccess(
    ownerId: string,
    id: string,
    minRole: ProjectRole,
  ): Promise<void> {
    const summary = await this.forms.findSummary(id);
    if (!summary) throw new NotFoundException(`Form not found: ${id}`);
    await this.projects.requireAccess(ownerId, summary.projectId, minRole);
  }
}
