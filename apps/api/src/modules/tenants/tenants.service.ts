import { Injectable } from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import { projectRoleFromFunctions } from "../projects/tenant-role.js";

/** A tenant as the workspace picker sees it (B4): identity + what the caller may do there. */
export interface TenantSummary {
  id: string;
  name: string;
  kind: string;
  /** Whether this is the caller's own personal tenant (slug `personal-<userId>`). */
  personal: boolean;
  /** The project role the caller's RBAC functions confer in this tenant (B3 mapping), or null. */
  projectRole: ProjectRole | null;
}

/**
 * Read-side of the caller's tenant memberships (Phase B4). Powers the "Workspace" picker in the
 * builder's New-project modal: the client offers only tenants whose `projectRole` is editor+.
 * Tenant management (rename, onboarding, vendor console) is a later phase.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly tenants: TenantRepo,
    private readonly rbac: RbacRepo,
  ) {}

  /** The caller's tenants, oldest membership first (personal tenant leads). */
  async listMine(userId: string): Promise<TenantSummary[]> {
    const records = await this.tenants.listTenantsForUser(userId);
    return Promise.all(
      records.map(async (t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        personal: t.slug === `personal-${userId}`,
        projectRole: projectRoleFromFunctions(await this.rbac.resolveFunctions(userId, t.id)),
      })),
    );
  }
}
