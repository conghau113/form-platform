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
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import type { CreateProjectDto } from "./dto/create-project.dto.js";
import { projectRoleFromFunctions } from "./tenant-role.js";

/** Single payload the builder (W2) renders as a DirectoryTree: project + flat folders + forms. */
export interface ProjectTree {
  project: ProjectRecord;
  folders: FolderRecord[];
  forms: FormSummary[];
}

/**
 * Project CRUD with role-based access (Track W; W1 owner-scoping, W5 sharing, B3 tenant scoping).
 * Access resolves through {@link requireAccess}: the canonical owner (`Project.ownerId`) always
 * has the `owner` role; other users get the role on their {@link ProjectMemberRepo} grant
 * (`editor`/`viewer`), or — B3 — the role their RBAC functions in the project's tenant map to
 * ({@link projectRoleFromFunctions}). No access → 404 (never leaking existence); access but too
 * low a role → 403. Slugs are unique per owner (`@@unique([ownerId, slug])`; B4 moves this to
 * tenant, together with creating projects inside a team tenant — creates stay personal here).
 */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly folders: FolderRepo,
    private readonly forms: FormRepo,
    private readonly members: ProjectMemberRepo,
    private readonly tenants: TenantRepo,
    private readonly rbac: RbacRepo,
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

  /**
   * Projects the user can see (most-recent first): ones they own, ones shared with them (W5),
   * and — B3 — ones in tenants where their RBAC functions confer at least `viewer`.
   */
  async list(userId: string): Promise<ProjectRecord[]> {
    const sharedIds = await this.members.listProjectIdsForUser(userId);
    const [owned, shared, tenantProjects] = await Promise.all([
      this.projects.list(userId),
      this.projects.findByIds(sharedIds), // one query, not one findById per shared id
      this.listTenantProjects(userId),
    ]);
    const byId = new Map(owned.map((p) => [p.id, p]));
    for (const p of [...shared, ...tenantProjects]) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /** Projects of every tenant the user holds a viewer+ role in (a user has 1–2 tenants in practice). */
  private async listTenantProjects(userId: string): Promise<ProjectRecord[]> {
    const tenantIds = await this.tenants.listTenantIdsForUser(userId);
    const visible: string[] = [];
    for (const tenantId of tenantIds) {
      const functions = await this.rbac.resolveFunctions(userId, tenantId);
      if (projectRoleFromFunctions(functions)) visible.push(tenantId);
    }
    return this.projects.listByTenants(visible);
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

  /** The user's role on a project (owner / grant / tenant functions), or `null` if no access. */
  async resolveRole(userId: string, projectId: string): Promise<ProjectRole | null> {
    const project = await this.projects.findById(projectId);
    if (!project) return null;
    return this.resolveRoleForProject(userId, project);
  }

  /**
   * The role a user holds on a loaded project: the canonical owner, else the higher of their W5
   * grant and — B3 — the role their RBAC functions in the project's tenant map to (union
   * semantics: an explicit low grant never demotes a tenant admin).
   */
  private async resolveRoleForProject(
    userId: string,
    project: ProjectRecord,
  ): Promise<ProjectRole | null> {
    if (project.ownerId === userId) return "owner";
    const [grant, functions] = await Promise.all([
      this.members.find(project.id, userId),
      this.rbac.resolveFunctions(userId, project.tenantId),
    ]);
    const granted = grant?.role ?? null;
    const tenantRole = projectRoleFromFunctions(functions);
    if (!granted || !tenantRole) return granted ?? tenantRole;
    return roleSatisfies(granted, tenantRole) ? granted : tenantRole;
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
    const role = await this.resolveRoleForProject(userId, project);
    if (!role) throw new NotFoundException(`Project not found: ${id}`);
    if (!roleSatisfies(role, minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role on project: ${id}`);
    }
    return project;
  }
}
