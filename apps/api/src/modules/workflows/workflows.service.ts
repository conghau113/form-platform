import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { migrateWorkflow, type WorkflowDefinition } from "@org/workflow-schema";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import type { WorkflowSummary } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { WorkflowRepo } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/** Optional placement supplied on save (`POST /workflows?projectId=&folderId=`). */
export interface SaveWorkflowOptions {
  ownerId: string;
  projectId?: string;
  folderId?: string | null;
}

/**
 * The server is the source of truth: every saved body is run through `migrateWorkflow` (which
 * validates and throws on invalid), so only normalized, current-version JSON is persisted.
 * Workflows are organisational metadata-aware (Workflow track WF0): a save can target a
 * project/folder; with no target, an existing workflow keeps its placement and a brand-new
 * workflow lands in "Unfiled". Mirrors {@link FormsService}.
 */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly workflows: WorkflowRepo,
    private readonly folders: FolderRepo,
    private readonly projects: ProjectRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  async save(body: unknown, opts: SaveWorkflowOptions): Promise<WorkflowDefinition> {
    const def = migrateWorkflow(body); // validates + normalizes to CURRENT_WORKFLOW_VERSION
    assertId(def.id, "workflow");
    const placement = await this.resolvePlacement(def.id, opts);
    return this.workflows.upsert(def, placement);
  }

  async load(ownerId: string, id: string): Promise<WorkflowDefinition> {
    assertId(id, "workflow");
    await this.requireAccess(ownerId, id, "viewer");
    const def = await this.workflows.load(id);
    if (!def) throw new NotFoundException(`Workflow not found: ${id}`);
    return def;
  }

  async list(
    ownerId: string,
    projectId: string,
    folderId?: string | null,
  ): Promise<WorkflowSummary[]> {
    await this.projectsService.requireAccess(ownerId, projectId, "viewer"); // 404 otherwise
    return this.workflows.listSummaries({ projectId, folderId });
  }

  async move(ownerId: string, id: string, folderId: string | null): Promise<WorkflowSummary> {
    const summary = await this.requireAccess(ownerId, id, "editor");
    if (folderId) await this.requireFolderInProject(folderId, summary.projectId);
    const moved = await this.workflows.move(id, folderId);
    if (!moved) throw new NotFoundException(`Workflow not found: ${id}`);
    return moved;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.requireAccess(ownerId, id, "editor");
    await this.workflows.delete(id);
  }

  /** Decide a workflow's `{ projectId, folderId }` for an upsert. */
  private async resolvePlacement(
    id: string,
    opts: SaveWorkflowOptions,
  ): Promise<{ projectId: string; folderId: string | null }> {
    if (opts.projectId) {
      await this.projectsService.requireAccess(opts.ownerId, opts.projectId, "editor");
      const folderId = opts.folderId ?? null;
      if (folderId) await this.requireFolderInProject(folderId, opts.projectId);
      return { projectId: opts.projectId, folderId };
    }
    // No explicit target: keep an existing workflow where it is; a new one lands in "Unfiled".
    const existing = await this.workflows.findSummary(id);
    if (existing) {
      // Still a write: the caller must be able to edit the workflow's current project.
      await this.projectsService.requireAccess(opts.ownerId, existing.projectId, "editor");
      return { projectId: existing.projectId, folderId: existing.folderId };
    }
    const unfiled = await this.projects.ensureUnfiled(opts.ownerId);
    return { projectId: unfiled.id, folderId: null };
  }

  /** Load a workflow summary and assert the user holds at least `minRole` on its project. */
  private async requireAccess(
    ownerId: string,
    id: string,
    minRole: ProjectRole,
  ): Promise<WorkflowSummary> {
    assertId(id, "workflow");
    const summary = await this.workflows.findSummary(id);
    if (!summary) throw new NotFoundException(`Workflow not found: ${id}`);
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
