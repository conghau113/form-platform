import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import {
  ProjectMemberRepo,
  type ProjectRole,
  roleSatisfies,
} from "../../persistence/repositories/project-member.repo.js";

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
 * Project CRUD with role-based access (Track W; W1 owner-scoping, W5 sharing). Access resolves
 * through {@link requireAccess}: the canonical owner (`Project.ownerId`) always has the `owner`
 * role; other users get the role on their {@link ProjectMemberRepo} grant (`editor`/`viewer`).
 * No access → 404 (never leaking existence); access but too low a role → 403. Slugs are unique
 * per owner (`@@unique([ownerId, slug])`).
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly folders: FolderRepo,
    private readonly forms: FormRepo,
    private readonly members: ProjectMemberRepo,
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

  /** Projects the user can see: ones they own plus ones shared with them (most-recent first). */
  async list(userId: string): Promise<ProjectRecord[]> {
    const owned = await this.projects.list(userId);
    const sharedIds = await this.members.listProjectIdsForUser(userId);
    const shared = (await Promise.all(sharedIds.map((id) => this.projects.findById(id)))).filter(
      (p): p is ProjectRecord => p !== null,
    );
    const byId = new Map(owned.map((p) => [p.id, p]));
    for (const p of shared) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /** Read gate (viewer+). Kept named `getOne` for the folders/forms read paths that reuse it. */
  getOne(userId: string, id: string): Promise<ProjectRecord> {
    return this.requireAccess(userId, id, "viewer");
  }

  async getTree(userId: string, id: string): Promise<ProjectTree> {
    const project = await this.requireAccess(userId, id, "viewer");
    const [folders, forms] = await Promise.all([
      this.folders.list(id),
      this.forms.listSummaries({ projectId: id }),
    ]);
    return { project, folders, forms };
  }

  async update(userId: string, id: string, patch: ProjectUpdateInput): Promise<ProjectRecord> {
    await this.requireAccess(userId, id, "owner");
    return this.projects.update(id, patch);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.requireAccess(userId, id, "owner");
    await this.projects.delete(id);
  }

  /** The user's role on a project (owner via `ownerId`, else the grant), or `null` if no access. */
  async resolveRole(userId: string, projectId: string): Promise<ProjectRole | null> {
    const project = await this.projects.findById(projectId);
    if (!project) return null;
    if (project.ownerId === userId) return "owner";
    return (await this.members.find(projectId, userId))?.role ?? null;
  }

  /**
   * Load a project and assert the user holds at least `minRole`. No access → 404 (no existence
   * leak); has access but below the required role → 403. Public so folders/forms reuse it.
   */
  async requireAccess(
    userId: string,
    id: string,
    minRole: ProjectRole = "viewer",
  ): Promise<ProjectRecord> {
    const project = await this.projects.findById(id);
    if (!project) throw new NotFoundException(`Project not found: ${id}`);
    const role =
      project.ownerId === userId ? "owner" : ((await this.members.find(id, userId))?.role ?? null);
    if (!role) throw new NotFoundException(`Project not found: ${id}`);
    if (!roleSatisfies(role, minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role on project: ${id}`);
    }
    return project;
  }
}
