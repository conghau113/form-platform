import { Injectable } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
import { projectActorRoles } from "./actor-roles.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "./projects.service.js";

/**
 * The domain roles the SERVER says a user acts in, on a project (product-roadmap Phase E3a).
 *
 * Before E3a these came from the request body (`AdvanceInstanceDto.roles`, `?roles=` on submissions),
 * which made `transition.role` and the form's `viewRoles`/`editRoles` gates decorative: anyone with
 * run access could name a role and read the masked fields. This service is the replacement — a
 * caller can no longer say what they are, only be it.
 *
 * ⚠️ The tenant is taken from `project.tenantId`, NEVER from the `X-Tenant-Id` header. With the
 * header, a member of tenant A holding a `Role` named `hr` could operate a case in tenant B and
 * unlock B's `hr`-gated fields just by naming A — the same escalation, relabelled.
 *
 * Lives in `projects/` because both `workflows/` and `submissions/` already import
 * {@link ProjectsModule}; the per-CASE extension (participants + assignee) sits in `workflows/`, so
 * this module never learns about cases.
 */
@Injectable()
export class ActorRolesService {
  constructor(
    private readonly projects: ProjectRepo,
    private readonly projectsService: ProjectsService,
    private readonly rbac: RbacRepo,
  ) {}

  /**
   * The caller's domain roles on a project — empty when the project is gone OR they hold no role on
   * it at all.
   *
   * Returning `[]` rather than throwing is deliberate: every call site has ALREADY made its access
   * decision (`requireAccess` / `requireRunAccess`), and this only decides how much of the data they
   * get to see. An empty list masks the most, which is the safe direction to fail in.
   *
   * The "no role on the project" branch matters even though today's callers all pre-check access:
   * without it, someone with no access to a project would still be handed the names of the tenant
   * `Role`s they hold, and a future call site that forgot its `requireAccess` would unmask gated
   * fields for them. Roles are only meaningful to someone who can open the project.
   */
  async forProject(userId: string, projectId: string): Promise<string[]> {
    const project = await this.projects.findById(projectId);
    if (!project) return [];
    const [role, roleNames] = await Promise.all([
      this.projectsService.resolveRoleForProject(userId, project),
      this.rbac.listUserRoleNames(userId, project.tenantId),
    ]);
    if (!role) return [];
    return projectActorRoles(role, roleNames);
  }
}
