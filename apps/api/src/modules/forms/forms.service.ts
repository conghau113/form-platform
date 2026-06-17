import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { type FormSchema, migrate } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/** Optional placement supplied on save (`POST /forms?projectId=&folderId=`). */
export interface SaveFormOptions {
  ownerId: string;
  projectId?: string;
  folderId?: string | null;
}

/**
 * The server is the source of truth: every saved body is run through `migrate` (which validates
 * and throws on invalid), so only normalized, current-version JSON is persisted. Forms are
 * organisational metadata-aware (Track W): a save can target a project/folder; with no target,
 * an existing form keeps its current placement and a brand-new form lands in "Unfiled".
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly forms: FormRepo,
    private readonly folders: FolderRepo,
    private readonly projects: ProjectRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  async save(body: unknown, opts: SaveFormOptions): Promise<FormSchema> {
    const form = migrate(body); // validates + normalizes to CURRENT_FORM_VERSION
    assertId(form.id, "form");
    const placement = await this.resolvePlacement(form.id, opts);
    return this.forms.upsert(form, placement);
  }

  async load(ownerId: string, id: string): Promise<FormSchema> {
    assertId(id, "form");
    await this.requireAccess(ownerId, id, "viewer");
    const form = await this.forms.load(id);
    if (!form) throw new NotFoundException(`Form not found: ${id}`);
    return form;
  }

  async list(ownerId: string, projectId: string, folderId?: string | null): Promise<FormSummary[]> {
    await this.projectsService.getOne(ownerId, projectId); // viewer+ read gate (404 otherwise)
    return this.forms.listSummaries({ projectId, folderId });
  }

  async move(ownerId: string, id: string, folderId: string | null): Promise<FormSummary> {
    const summary = await this.requireAccess(ownerId, id, "editor");
    if (folderId) await this.requireFolderInProject(folderId, summary.projectId);
    const moved = await this.forms.move(id, folderId);
    if (!moved) throw new NotFoundException(`Form not found: ${id}`);
    return moved;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.requireAccess(ownerId, id, "editor");
    await this.forms.delete(id);
  }

  /** Decide a form's `{ projectId, folderId }` for an upsert. */
  private async resolvePlacement(
    id: string,
    opts: SaveFormOptions,
  ): Promise<{ projectId: string; folderId: string | null }> {
    if (opts.projectId) {
      await this.projectsService.requireAccess(opts.ownerId, opts.projectId, "editor");
      const folderId = opts.folderId ?? null;
      if (folderId) await this.requireFolderInProject(folderId, opts.projectId);
      return { projectId: opts.projectId, folderId };
    }
    // No explicit target: keep an existing form where it is; a new form lands in "Unfiled".
    const existing = await this.forms.findSummary(id);
    if (existing) {
      // Still a write: the caller must be able to edit the form's current project.
      await this.projectsService.requireAccess(opts.ownerId, existing.projectId, "editor");
      return { projectId: existing.projectId, folderId: existing.folderId };
    }
    const unfiled = await this.projects.ensureUnfiled(opts.ownerId);
    return { projectId: unfiled.id, folderId: null };
  }

  /** Load a form summary and assert the user holds at least `minRole` on its project. */
  private async requireAccess(
    ownerId: string,
    id: string,
    minRole: ProjectRole,
  ): Promise<FormSummary> {
    assertId(id, "form");
    const summary = await this.forms.findSummary(id);
    if (!summary) throw new NotFoundException(`Form not found: ${id}`);
    await this.projectsService.requireAccess(ownerId, summary.projectId, minRole);
    return summary;
  }

  private async requireFolderInProject(folderId: string, projectId: string): Promise<void> {
    const folder = await this.folders.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new BadRequestException(`Folder not in project: ${folderId}`);
    }
  }
}
