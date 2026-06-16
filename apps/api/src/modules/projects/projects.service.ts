import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ensureUniqueSlug, slugify } from "../../common/slug.js";
import type { FolderRecord } from "../../persistence/repositories/folder.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import type {
  ProjectRecord,
  ProjectUpdateInput,
} from "../../persistence/repositories/project.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";

export interface CreateProjectDto {
  name: string;
  description?: string | null;
}

/** Single payload the builder (W2) renders as a DirectoryTree: project + flat folders + forms. */
export interface ProjectTree {
  project: ProjectRecord;
  folders: FolderRecord[];
  forms: FormSummary[];
}

/**
 * Owner-scoped project CRUD (Track W, W1). Every read/write resolves the project through
 * {@link requireOwned} so a caller can only ever touch their own projects (ownership mismatch →
 * 404, never leaking existence). Slugs are unique per owner (`@@unique([ownerId, slug])`).
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly folders: FolderRepo,
    private readonly forms: FormRepo,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectRecord> {
    if (!dto.name?.trim()) throw new BadRequestException("Project name is required");
    const existing = await this.projects.list(ownerId);
    const slug = ensureUniqueSlug(
      slugify(dto.name),
      existing.map((p) => p.slug),
    );
    return this.projects.create({
      ownerId,
      name: dto.name.trim(),
      slug,
      description: dto.description ?? null,
    });
  }

  list(ownerId: string): Promise<ProjectRecord[]> {
    return this.projects.list(ownerId);
  }

  getOne(ownerId: string, id: string): Promise<ProjectRecord> {
    return this.requireOwned(ownerId, id);
  }

  async getTree(ownerId: string, id: string): Promise<ProjectTree> {
    const project = await this.requireOwned(ownerId, id);
    const [folders, forms] = await Promise.all([
      this.folders.list(id),
      this.forms.listSummaries({ projectId: id }),
    ]);
    return { project, folders, forms };
  }

  async update(ownerId: string, id: string, patch: ProjectUpdateInput): Promise<ProjectRecord> {
    await this.requireOwned(ownerId, id);
    return this.projects.update(id, patch);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.requireOwned(ownerId, id);
    await this.projects.delete(id);
  }

  /** Load a project and assert it belongs to `ownerId`; otherwise 404 (no existence leak). */
  private async requireOwned(ownerId: string, id: string): Promise<ProjectRecord> {
    const project = await this.projects.findById(id);
    if (!project || project.ownerId !== ownerId) {
      throw new NotFoundException(`Project not found: ${id}`);
    }
    return project;
  }
}
