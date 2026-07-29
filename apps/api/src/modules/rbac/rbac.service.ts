import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { BASE_FUNCTIONS } from "../../auth/function-catalog.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { OrgUnitRepo } from "../../persistence/repositories/org-unit.repo.js";
import type {
  FunctionRecord,
  RoleRecord,
  TenantUserRecord,
} from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { UserRepo } from "../../persistence/repositories/user.repo.js";
import type { AddMemberDto } from "./dto/add-member.dto.js";
import type { SetRoleDataScopesDto } from "./dto/set-role-data-scopes.dto.js";
import type { SetRoleFunctionsDto } from "./dto/set-role-functions.dto.js";
import type { SetUserRolesDto } from "./dto/set-user-roles.dto.js";
import type { UpsertRoleDto } from "./dto/upsert-role.dto.js";

/** A role plus the function codes it grants and its data-scope org units (the shape the admin UI
 *  edits). `dataScopes` empty = tenant-wide (C3). */
export interface RoleWithFunctions extends RoleRecord {
  functions: string[];
  dataScopes: string[];
}

/**
 * RBAC service (product-roadmap Phase C1/C2/C4). Seeds the platform function catalog at boot, and owns
 * tenant-scoped role management + user↔role assignment. Every operation is scoped to the caller's
 * tenant (resolved from membership, mirroring {@link OrgUnitsService}); a role in another tenant reads
 * as 404 (no existence leak). `system` roles (the auto-provisioned admin) can't be edited or deleted.
 * The function catalog is a read-only global set in this slice (client-defined functions come later).
 */
@Injectable()
export class RbacService implements OnModuleInit {
  constructor(
    private readonly rbac: RbacRepo,
    private readonly tenants: TenantRepo,
    private readonly users: UserRepo,
    private readonly audit: AuditRepo,
    private readonly orgUnits: OrgUnitRepo,
  ) {}

  /** A role paired with its granted functions + data-scope org units (the admin UI shape). */
  private async withGrants(role: RoleRecord): Promise<RoleWithFunctions> {
    const [functions, dataScopes] = await Promise.all([
      this.rbac.listRoleFunctions(role.id),
      this.rbac.listRoleDataScopes(role.id),
    ]);
    return { ...role, functions, dataScopes };
  }

  /** Seed the immutable base function catalog (idempotent; safe to run every boot). */
  async onModuleInit(): Promise<void> {
    await this.rbac.seedFunctions(BASE_FUNCTIONS);
  }

  /** The caller's effective function codes in their active tenant (seam for nav gating, §6.7). */
  async myFunctions(userId: string, activeTenantId?: string): Promise<string[]> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) return [];
    return this.rbac.resolveFunctions(userId, tenantId);
  }

  /** The full platform function catalog (for the role editor). */
  listFunctions(): Promise<FunctionRecord[]> {
    return this.rbac.listFunctions();
  }

  async listRoles(userId: string, activeTenantId?: string): Promise<RoleWithFunctions[]> {
    const tenantId = await this.requireTenant(userId, activeTenantId);
    const roles = await this.rbac.listRoles(tenantId);
    return Promise.all(roles.map((r) => this.withGrants(r)));
  }

  async createRole(
    userId: string,
    dto: UpsertRoleDto,
    activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    if (!dto.name?.trim()) throw new BadRequestException("Role name is required");
    const tenantId = await this.requireTenant(userId, activeTenantId);
    try {
      const role = await this.rbac.createRole({
        tenantId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
      });
      await this.audit.record({
        tenantId,
        actorId: userId,
        action: "role.create",
        targetType: "role",
        targetId: role.id,
        detail: { name: role.name },
      });
      return { ...role, functions: [], dataScopes: [] };
    } catch (err) {
      throw toConflict(err, `A role named "${dto.name.trim()}" already exists`);
    }
  }

  async updateRole(
    userId: string,
    id: string,
    dto: UpsertRoleDto,
    activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    const role = await this.requireEditableRole(userId, id, activeTenantId); // tenant + non-system
    try {
      const updated = await this.rbac.updateRole(id, {
        name: dto.name?.trim(),
        description: dto.description === undefined ? undefined : dto.description?.trim() || null,
      });
      await this.audit.record({
        tenantId: role.tenantId,
        actorId: userId,
        action: "role.update",
        targetType: "role",
        targetId: id,
        detail: { name: updated.name },
      });
      return this.withGrants(updated);
    } catch (err) {
      throw toConflict(err, `A role named "${dto.name?.trim()}" already exists`);
    }
  }

  async deleteRole(userId: string, id: string, activeTenantId?: string): Promise<void> {
    const role = await this.requireEditableRole(userId, id, activeTenantId);
    await this.rbac.deleteRole(id);
    await this.audit.record({
      tenantId: role.tenantId,
      actorId: userId,
      action: "role.delete",
      targetType: "role",
      targetId: id,
      detail: { name: role.name },
    });
  }

  /** Replace a role's granted function codes; every code must exist in the catalog. */
  async setRoleFunctions(
    userId: string,
    id: string,
    dto: SetRoleFunctionsDto,
    activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    const role = await this.requireEditableRole(userId, id, activeTenantId);
    await this.assertKnownFunctions(dto.functions);
    await this.rbac.setRoleFunctions(id, dto.functions);
    await this.audit.record({
      tenantId: role.tenantId,
      actorId: userId,
      action: "role.set-functions",
      targetType: "role",
      targetId: id,
      detail: { functions: dto.functions },
    });
    return this.withGrants(role);
  }

  /** Replace a role's data-scope org units (C3); every unit must live in the role's tenant. An empty
   *  set clears the scope (tenant-wide). */
  async setRoleDataScopes(
    userId: string,
    id: string,
    dto: SetRoleDataScopesDto,
    activeTenantId?: string,
  ): Promise<RoleWithFunctions> {
    const role = await this.requireEditableRole(userId, id, activeTenantId);
    await this.assertOrgUnitsInTenant(dto.orgUnitIds, role.tenantId);
    await this.rbac.setRoleDataScopes(id, dto.orgUnitIds);
    await this.audit.record({
      tenantId: role.tenantId,
      actorId: userId,
      action: "role.set-data-scopes",
      targetType: "role",
      targetId: id,
      detail: { orgUnitIds: dto.orgUnitIds },
    });
    return this.withGrants(role);
  }

  /** Assert every org unit exists and lives in `tenantId` (C3 data-scope validation); 400 otherwise. */
  private async assertOrgUnitsInTenant(orgUnitIds: string[], tenantId: string): Promise<void> {
    for (const orgUnitId of new Set(orgUnitIds)) {
      const unit = await this.orgUnits.findById(orgUnitId);
      if (!unit || unit.tenantId !== tenantId) {
        throw new BadRequestException(`Org unit not in tenant: ${orgUnitId}`);
      }
    }
  }

  /** The caller's tenant members with the roles each holds (Phase D1 admin user list). */
  async listUsers(userId: string, activeTenantId?: string): Promise<TenantUserRecord[]> {
    const tenantId = await this.requireTenant(userId, activeTenantId);
    return this.rbac.listTenantUsers(tenantId);
  }

  /**
   * Add an existing user to the caller's tenant by email (D1 — the first writer that grows a
   * personal tenant into a team). Idempotent; the user arrives with no roles (assign separately).
   * Real email invitations (users who don't exist yet) are Phase A2 (needs SMTP).
   */
  async addMember(
    userId: string,
    dto: AddMemberDto,
    activeTenantId?: string,
  ): Promise<TenantUserRecord[]> {
    const tenantId = await this.requireTenant(userId, activeTenantId);
    const target = await this.users.findByEmail(dto.email.trim().toLowerCase());
    // 404 reveals whether an email is registered — acceptable: the caller already holds user.admin.
    if (!target) throw new NotFoundException(`No user with email: ${dto.email}`);
    await this.tenants.addMember(tenantId, target.id);
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: "member.add",
      targetType: "user",
      targetId: target.id,
      detail: { email: target.email },
    });
    return this.rbac.listTenantUsers(tenantId);
  }

  /** The role ids currently assigned to a user (within the caller's tenant). */
  async getUserRoles(
    userId: string,
    targetUserId: string,
    activeTenantId?: string,
  ): Promise<string[]> {
    const tenantId = await this.requireTenant(userId, activeTenantId);
    await this.requireMember(targetUserId, tenantId);
    return this.rbac.listUserRoleIds(targetUserId, tenantId);
  }

  /** Replace a user's assigned roles; the target must be a tenant member and every role must live
   *  in the caller's tenant. */
  async setUserRoles(
    userId: string,
    targetUserId: string,
    dto: SetUserRolesDto,
    activeTenantId?: string,
  ): Promise<string[]> {
    const tenantId = await this.requireTenant(userId, activeTenantId);
    await this.requireMember(targetUserId, tenantId);
    for (const roleId of dto.roleIds) {
      const role = await this.rbac.findRoleById(roleId);
      if (!role || role.tenantId !== tenantId) {
        throw new BadRequestException(`Role not in tenant: ${roleId}`);
      }
    }
    await this.rbac.setUserRoles(targetUserId, tenantId, dto.roleIds);
    await this.audit.record({
      tenantId,
      actorId: userId,
      action: "user.set-roles",
      targetType: "user",
      targetId: targetUserId,
      detail: { roleIds: dto.roleIds },
    });
    return this.rbac.listUserRoleIds(targetUserId, tenantId);
  }

  /** The caller's active tenant (B1 guarantees at least one); absent → 404 (defensive). */
  private async requireTenant(userId: string, activeTenantId?: string): Promise<string> {
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantId);
    if (!tenantId) throw new NotFoundException("No tenant for user");
    return tenantId;
  }

  /** Assert the target user is a member of the tenant → 404 otherwise (no existence leak). */
  private async requireMember(targetUserId: string, tenantId: string): Promise<void> {
    if (!(await this.tenants.isMember(targetUserId, tenantId))) {
      throw new NotFoundException(`User not in tenant: ${targetUserId}`);
    }
  }

  /** Load a role, assert it lives in the caller's tenant (404) and is not a system role (400). */
  private async requireEditableRole(
    userId: string,
    id: string,
    activeTenantId?: string,
  ): Promise<RoleRecord> {
    const tenantId = await this.requireTenant(userId, activeTenantId);
    const role = await this.rbac.findRoleById(id);
    if (!role || role.tenantId !== tenantId) throw new NotFoundException(`Role not found: ${id}`);
    if (role.system) throw new BadRequestException("The built-in admin role can't be modified");
    return role;
  }

  /** Reject any function code not in the catalog (data integrity for grants). */
  private async assertKnownFunctions(codes: string[]): Promise<void> {
    const known = new Set((await this.rbac.listFunctions()).map((f) => f.code));
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown function code(s): ${unknown.join(", ")}`);
    }
  }
}

/** Map a Prisma unique-constraint violation (P2002) to a 409; rethrow anything else. */
function toConflict(err: unknown, message: string): Error {
  if (typeof err === "object" && err !== null && "code" in err && err.code === "P2002") {
    return new ConflictException(message);
  }
  return err instanceof Error ? err : new Error(String(err));
}
