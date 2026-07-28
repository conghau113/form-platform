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
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { OrgUnitRepo } from "../../persistence/repositories/org-unit.repo.js";
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
import type { ScopedGrant } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import type { CreateProjectDto } from "./dto/create-project.dto.js";
import {
  collectAncestors,
  hasScopedGrant,
  projectRoleFromFunctions,
  projectRoleFromScopedGrants,
} from "./tenant-role.js";

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
 * (`editor`/`viewer`), or — B3/C3 — the role their RBAC grants in the project's tenant map to,
 * data-scoped by the project's org unit ({@link projectRoleFromScopedGrants}). No access → 404
 * (never leaking existence); access but too low a role → 403. Slugs are unique per tenant
 * (`@@unique([tenantId, slug])`, B4); creates default to the personal tenant, with `dto.tenantId`
 * opting into a team tenant (editor+ there).
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
    private readonly orgUnits: OrgUnitRepo,
  ) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectRecord> {
    if (!dto.name?.trim()) throw new BadRequestException("Project name is required");
    const personal = await this.tenants.ensureTenantForOwner(ownerId);
    const tenantId = dto.tenantId ?? personal;
    if (tenantId !== personal) {
      // B4: creating into a team tenant needs an editor-level role there (same mapping as B3
      // reads). Not a member → 404 (no existence leak); member below editor → 403.
      const role = projectRoleFromFunctions(await this.rbac.resolveFunctions(ownerId, tenantId));
      if (!role) throw new NotFoundException(`Tenant not found: ${tenantId}`);
      if (!roleSatisfies(role, "editor")) {
        throw new ForbiddenException(`Requires editor role in tenant: ${tenantId}`);
      }
    }
    if (dto.orgUnitId) await this.requireOrgUnitInTenant(dto.orgUnitId, tenantId);
    // Slugs are unique per tenant (B4) — derive the taken set from the whole target tenant.
    const existing = await this.projects.listByTenants([tenantId]);
    const slug = ensureUniqueSlug(
      slugify(dto.name),
      existing.map((p) => p.slug),
    );
    return this.projects.create({
      ownerId,
      tenantId,
      orgUnitId: dto.orgUnitId ?? null,
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

  /**
   * Projects the user can see in their tenants, filtered per-project by data-scope (C3). For each
   * tenant (a user has 1–2 in practice) their scoped RBAC grants decide which placed projects they
   * reach; the org tree is loaded once per tenant and only when a scoped grant might apply.
   */
  private async listTenantProjects(userId: string): Promise<ProjectRecord[]> {
    const tenantIds = await this.tenants.listTenantIdsForUser(userId);
    const result: ProjectRecord[] = [];
    for (const tenantId of tenantIds) {
      const grants = await this.rbac.resolveScopedGrants(userId, tenantId);
      if (grants.length === 0) continue;
      const projects = await this.projects.listByTenants([tenantId]);
      if (projects.length === 0) continue;
      const units = hasScopedGrant(grants) ? await this.orgUnits.list(tenantId) : [];
      for (const p of projects) {
        const ancestors = p.orgUnitId ? collectAncestors(units, p.orgUnitId) : new Set<string>();
        if (projectRoleFromScopedGrants(grants, ancestors)) result.push(p);
      }
    }
    return result;
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
    const project = await this.requireAccess(userId, id, "owner");
    // Placing (non-null orgUnitId) must target a unit in the project's tenant; `null` unplaces.
    if (patch.orgUnitId) await this.requireOrgUnitInTenant(patch.orgUnitId, project.tenantId);
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
   * grant and — B3/C3 — the role their RBAC grants in the project's tenant map to, data-scoped by
   * the project's org unit (union semantics: an explicit low grant never demotes a tenant admin).
   */
  private async resolveRoleForProject(
    userId: string,
    project: ProjectRecord,
  ): Promise<ProjectRole | null> {
    if (project.ownerId === userId) return "owner";
    const [grant, grants] = await Promise.all([
      this.members.find(project.id, userId),
      this.rbac.resolveScopedGrants(userId, project.tenantId),
    ]);
    const granted = grant?.role ?? null;
    const tenantRole = await this.tenantRoleForProject(grants, project);
    if (!granted || !tenantRole) return granted ?? tenantRole;
    return roleSatisfies(granted, tenantRole) ? granted : tenantRole;
  }

  /**
   * The role a user's scoped RBAC grants confer on one project by its org-unit placement (C3). The
   * org tree is only loaded when the project is placed and a scoped grant might apply — the common
   * personal-tenant path (no scoped grants) skips it.
   */
  private async tenantRoleForProject(
    grants: ScopedGrant[],
    project: ProjectRecord,
  ): Promise<ProjectRole | null> {
    let ancestors = new Set<string>();
    if (project.orgUnitId && hasScopedGrant(grants)) {
      const units = await this.orgUnits.list(project.tenantId);
      ancestors = collectAncestors(units, project.orgUnitId);
    }
    return projectRoleFromScopedGrants(grants, ancestors);
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

  /** Assert an org unit exists and lives in the given tenant (C3 placement); 400 otherwise. */
  private async requireOrgUnitInTenant(orgUnitId: string, tenantId: string): Promise<void> {
    const unit = await this.orgUnits.findById(orgUnitId);
    if (!unit || unit.tenantId !== tenantId) {
      throw new BadRequestException(`Org unit not in tenant: ${orgUnitId}`);
    }
  }
}
