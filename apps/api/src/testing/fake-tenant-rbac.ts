import { type OrgUnitRecord, OrgUnitRepo } from "../persistence/repositories/org-unit.repo.js";
import type {
  FunctionRecord,
  RoleRecord,
  ScopedGrant,
  TenantUserRecord,
} from "../persistence/repositories/rbac.repo.js";
import { RbacRepo } from "../persistence/repositories/rbac.repo.js";
import { type TenantRecord, TenantRepo } from "../persistence/repositories/tenant.repo.js";

/**
 * In-memory {@link TenantRepo} for service tests (B3). Personal tenants use the deterministic id
 * `tnt_<ownerId>` — the same shape the FakeProjectRepo fakes stamp on `ProjectRecord.tenantId` —
 * so a project's tenant and its owner's tenant line up without a real backfill.
 */
export class FakeTenantRepo extends TenantRepo {
  /** userId → tenantIds, oldest membership first. */
  readonly memberships = new Map<string, string[]>();

  static tenantIdFor(ownerId: string): string {
    return `tnt_${ownerId}`;
  }

  /** Test helper: add a membership (idempotent, preserves join order). */
  join(userId: string, tenantId: string): void {
    const list = this.memberships.get(userId) ?? [];
    if (!list.includes(tenantId)) list.push(tenantId);
    this.memberships.set(userId, list);
  }

  async ensureTenantForOwner(ownerId: string): Promise<string> {
    return FakeTenantRepo.tenantIdFor(ownerId);
  }
  async findTenantIdForUser(userId: string): Promise<string | null> {
    return this.memberships.get(userId)?.[0] ?? null;
  }
  async listTenantIdsForUser(userId: string): Promise<string[]> {
    return this.memberships.get(userId) ?? [];
  }
  async listTenantsForUser(userId: string): Promise<TenantRecord[]> {
    // Synthesise records from the deterministic id shape: `tnt_<owner>` ↔ slug `personal-<owner>`
    // (mirrors the B1 backfill), so the `personal` flag resolves without a registry.
    return (this.memberships.get(userId) ?? []).map((tenantId) => {
      const owner = tenantId.replace(/^tnt_/, "");
      const at = new Date(0);
      return {
        id: tenantId,
        name: owner,
        slug: `personal-${owner}`,
        kind: "personal",
        createdAt: at,
        updatedAt: at,
      };
    });
  }
  async isMember(userId: string, tenantId: string): Promise<boolean> {
    return (this.memberships.get(userId) ?? []).includes(tenantId);
  }
  async addMember(tenantId: string, userId: string): Promise<void> {
    this.join(userId, tenantId);
  }
  async ensurePersonalTenant(userId: string): Promise<string> {
    const tenantId = FakeTenantRepo.tenantIdFor(userId);
    this.join(userId, tenantId);
    return tenantId;
  }
}

/**
 * {@link RbacRepo} stub for service tests (B3/C3): `resolveScopedGrants` + `resolveFunctions` are real —
 * seed grants via {@link grant} (tenant-wide) or {@link grantScoped} (C3 org-scoped). ProjectsService
 * touches nothing else; the rest throws to catch accidental use.
 */
export class FakeRbacRepo extends RbacRepo {
  private readonly grants = new Map<string, ScopedGrant[]>();
  private readonly tenantUsers = new Map<string, TenantUserRecord[]>();

  /** Test helper: set the user's effective function codes within a tenant (one tenant-wide role). */
  grant(userId: string, tenantId: string, functions: string[]): void {
    this.grants.set(`${userId}:${tenantId}`, [{ functions, scopeOrgUnitIds: [] }]);
  }

  /** Test helper: set the user's per-role scoped grants within a tenant (C3). */
  grantScoped(userId: string, tenantId: string, grants: ScopedGrant[]): void {
    this.grants.set(`${userId}:${tenantId}`, grants);
  }

  async resolveScopedGrants(userId: string, tenantId: string): Promise<ScopedGrant[]> {
    return this.grants.get(`${userId}:${tenantId}`) ?? [];
  }

  async resolveFunctions(userId: string, tenantId: string): Promise<string[]> {
    const grants = this.grants.get(`${userId}:${tenantId}`) ?? [];
    return [...new Set(grants.flatMap((g) => g.functions))];
  }

  async seedFunctions(): Promise<void> {
    throw new Error("not used");
  }
  async listFunctions(): Promise<FunctionRecord[]> {
    throw new Error("not used");
  }
  async createRole(): Promise<RoleRecord> {
    throw new Error("not used");
  }
  async listRoles(): Promise<RoleRecord[]> {
    throw new Error("not used");
  }
  async findRoleById(): Promise<RoleRecord | null> {
    throw new Error("not used");
  }
  async updateRole(): Promise<RoleRecord> {
    throw new Error("not used");
  }
  async deleteRole(): Promise<void> {
    throw new Error("not used");
  }
  async setRoleFunctions(): Promise<void> {
    throw new Error("not used");
  }
  async listRoleFunctions(): Promise<string[]> {
    throw new Error("not used");
  }
  async setRoleDataScopes(): Promise<void> {
    throw new Error("not used");
  }
  async listRoleDataScopes(): Promise<string[]> {
    throw new Error("not used");
  }
  /** Test helper: the members a tenant reports (Phase E assignee picker). */
  setTenantUsers(tenantId: string, users: TenantUserRecord[]): void {
    this.tenantUsers.set(tenantId, users);
  }

  async listTenantUsers(tenantId: string): Promise<TenantUserRecord[]> {
    return this.tenantUsers.get(tenantId) ?? [];
  }
  async setUserRoles(): Promise<void> {
    throw new Error("not used");
  }
  async listUserRoleIds(): Promise<string[]> {
    throw new Error("not used");
  }
  async ensureTenantAdmin(): Promise<void> {
    throw new Error("not used");
  }
}

/**
 * {@link OrgUnitRepo} stub for ProjectsService tests (C3): seed a flat tree via {@link seed}; only
 * `list` + `findById` are real (the chokepoint's data-scope resolution reads the tree). The rest
 * throws to catch accidental use.
 */
export class FakeOrgUnitRepo extends OrgUnitRepo {
  readonly rows = new Map<string, OrgUnitRecord>();

  /** Test helper: add a unit `{ id, tenantId, parentId }` to the tree. */
  seed(id: string, tenantId: string, parentId: string | null): void {
    this.rows.set(id, {
      id,
      tenantId,
      parentId,
      name: id,
      kind: null,
      order: 0,
      createdAt: new Date(0),
    });
  }

  async list(tenantId: string): Promise<OrgUnitRecord[]> {
    return [...this.rows.values()].filter((u) => u.tenantId === tenantId);
  }
  async findById(id: string): Promise<OrgUnitRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async create(): Promise<OrgUnitRecord> {
    throw new Error("not used");
  }
  async update(): Promise<OrgUnitRecord> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {
    throw new Error("not used");
  }
  async countChildren(): Promise<{ units: number; members: number }> {
    throw new Error("not used");
  }
}
