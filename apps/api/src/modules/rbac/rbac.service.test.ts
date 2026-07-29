import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_FUNCTIONS } from "../../auth/function-catalog.js";
import { type AuditEntry, AuditRepo } from "../../persistence/repositories/audit.repo.js";
import {
  type FunctionRecord,
  type FunctionSeed,
  RbacRepo,
  type RoleCreateInput,
  type RoleRecord,
  type RoleUpdateInput,
  type TenantUserRecord,
  WILDCARD_FUNCTION,
} from "../../persistence/repositories/rbac.repo.js";
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import { type UserRecord, UserRepo } from "../../persistence/repositories/user.repo.js";
import { FakeOrgUnitRepo } from "../../testing/fake-tenant-rbac.js";
import { RbacService } from "./rbac.service.js";

let seq = 0;

/** In-memory RbacRepo mirroring the Prisma semantics used by the service (tenant-scoped roles,
 *  union permission resolution, `*` wildcard, unique (tenantId,name) → P2002). */
class FakeRbacRepo extends RbacRepo {
  functions = new Map<string, FunctionRecord>();
  roles = new Map<string, RoleRecord>();
  roleFns = new Map<string, Set<string>>(); // roleId -> function codes
  userRoles = new Map<string, Set<string>>(); // userId -> role ids

  async seedFunctions(fns: FunctionSeed[]): Promise<void> {
    for (const f of fns) {
      this.functions.set(f.code, {
        code: f.code,
        name: f.name,
        parentCode: f.parentCode ?? null,
        system: true,
      });
    }
  }
  async listFunctions(): Promise<FunctionRecord[]> {
    return [...this.functions.values()];
  }
  async createRole(input: RoleCreateInput): Promise<RoleRecord> {
    for (const r of this.roles.values()) {
      if (r.tenantId === input.tenantId && r.name === input.name) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
    }
    const role: RoleRecord = {
      id: `role${++seq}`,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      system: input.system ?? false,
      createdAt: new Date(),
    };
    this.roles.set(role.id, role);
    return role;
  }
  async listRoles(tenantId: string): Promise<RoleRecord[]> {
    return [...this.roles.values()].filter((r) => r.tenantId === tenantId);
  }
  async findRoleById(id: string): Promise<RoleRecord | null> {
    return this.roles.get(id) ?? null;
  }
  async updateRole(id: string, patch: RoleUpdateInput): Promise<RoleRecord> {
    const role = this.roles.get(id);
    if (!role) throw new Error("missing");
    const updated = {
      ...role,
      name: patch.name ?? role.name,
      description: patch.description === undefined ? role.description : patch.description,
    };
    this.roles.set(id, updated);
    return updated;
  }
  async deleteRole(id: string): Promise<void> {
    this.roles.delete(id);
    this.roleFns.delete(id);
  }
  async setRoleFunctions(roleId: string, codes: string[]): Promise<void> {
    this.roleFns.set(roleId, new Set(codes));
  }
  async listRoleFunctions(roleId: string): Promise<string[]> {
    return [...(this.roleFns.get(roleId) ?? [])];
  }
  roleScopes = new Map<string, Set<string>>(); // roleId -> org-unit ids
  async setRoleDataScopes(roleId: string, orgUnitIds: string[]): Promise<void> {
    this.roleScopes.set(roleId, new Set(orgUnitIds));
  }
  async listRoleDataScopes(roleId: string): Promise<string[]> {
    return [...(this.roleScopes.get(roleId) ?? [])];
  }
  tenantUsers = new Map<string, TenantUserRecord[]>(); // tenantId -> member records
  async listTenantUsers(tenantId: string): Promise<TenantUserRecord[]> {
    return this.tenantUsers.get(tenantId) ?? [];
  }
  async setUserRoles(userId: string, tenantId: string, roleIds: string[]): Promise<void> {
    // Keep this user's roles in other tenants; replace only those in `tenantId`.
    const kept = [...(this.userRoles.get(userId) ?? [])].filter(
      (id) => this.roles.get(id)?.tenantId !== tenantId,
    );
    this.userRoles.set(userId, new Set([...kept, ...roleIds]));
  }
  async listUserRoleIds(userId: string, tenantId?: string): Promise<string[]> {
    const ids = [...(this.userRoles.get(userId) ?? [])];
    if (!tenantId) return ids;
    return ids.filter((id) => this.roles.get(id)?.tenantId === tenantId);
  }
  async resolveFunctions(userId: string, tenantId: string): Promise<string[]> {
    const codes = new Set<string>();
    for (const roleId of this.userRoles.get(userId) ?? []) {
      if (this.roles.get(roleId)?.tenantId !== tenantId) continue;
      for (const c of this.roleFns.get(roleId) ?? []) codes.add(c);
    }
    return [...codes];
  }
  async resolveScopedGrants(
    userId: string,
    tenantId: string,
  ): Promise<{ functions: string[]; scopeOrgUnitIds: string[] }[]> {
    const grants: { functions: string[]; scopeOrgUnitIds: string[] }[] = [];
    for (const roleId of this.userRoles.get(userId) ?? []) {
      if (this.roles.get(roleId)?.tenantId !== tenantId) continue;
      grants.push({
        functions: [...(this.roleFns.get(roleId) ?? [])],
        scopeOrgUnitIds: [...(this.roleScopes.get(roleId) ?? [])],
      });
    }
    return grants;
  }
  async ensureTenantAdmin(userId: string, tenantId: string): Promise<void> {
    const role = await this.createRole({ tenantId, name: "Admin", system: true });
    await this.setRoleFunctions(role.id, [WILDCARD_FUNCTION]);
    this.userRoles.set(userId, new Set([...(this.userRoles.get(userId) ?? []), role.id]));
  }
}

/** Two users in two tenants: alice→tenant A, bob→tenant B. `map` seeds the memberships. */
class FakeTenantRepo extends TenantRepo {
  map = new Map<string, string>([
    ["alice", "tenantA"],
    ["bob", "tenantB"],
  ]);
  added: Array<{ tenantId: string; userId: string }> = [];
  async ensureTenantForOwner(ownerId: string): Promise<string> {
    return this.map.get(ownerId) ?? ownerId;
  }
  async ensurePersonalTenant(userId: string): Promise<string> {
    return this.map.get(userId) ?? userId;
  }
  async findTenantIdForUser(userId: string): Promise<string | null> {
    return this.map.get(userId) ?? null;
  }
  async listTenantIdsForUser(userId: string): Promise<string[]> {
    const tenantId = this.map.get(userId);
    return tenantId ? [tenantId] : [];
  }
  async listTenantsForUser(): Promise<never> {
    throw new Error("not used");
  }
  async isMember(userId: string, tenantId: string): Promise<boolean> {
    if (this.map.get(userId) === tenantId) return true;
    return this.added.some((m) => m.userId === userId && m.tenantId === tenantId);
  }
  async addMember(tenantId: string, userId: string): Promise<void> {
    if (!(await this.isMember(userId, tenantId))) this.added.push({ tenantId, userId });
  }
}

/** Accounts findable by email (for add-member). */
class FakeUserRepo extends UserRepo {
  byEmail = new Map<string, UserRecord>();
  seed(id: string, email: string): void {
    this.byEmail.set(email, {
      id,
      email,
      passwordHash: "x",
      displayName: null,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.byEmail.get(email) ?? null;
  }
  async findById(): Promise<UserRecord | null> {
    return null;
  }
  async create(): Promise<UserRecord> {
    throw new Error("not used");
  }
  async updatePassword(): Promise<void> {}
  async markEmailVerified(): Promise<void> {}
}

/** Captures audit writes so tests can assert who-did-what was recorded. */
class FakeAuditRepo extends AuditRepo {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

describe("RbacService", () => {
  let rbac: FakeRbacRepo;
  let tenants: FakeTenantRepo;
  let users: FakeUserRepo;
  let audit: FakeAuditRepo;
  let orgUnits: FakeOrgUnitRepo;
  let service: RbacService;

  beforeEach(async () => {
    rbac = new FakeRbacRepo();
    tenants = new FakeTenantRepo();
    users = new FakeUserRepo();
    audit = new FakeAuditRepo();
    orgUnits = new FakeOrgUnitRepo();
    service = new RbacService(rbac, tenants, users, audit, orgUnits);
    await service.onModuleInit(); // seed the catalog
  });

  it("seeds the base function catalog at boot", async () => {
    const codes = (await service.listFunctions()).map((f) => f.code);
    for (const f of BASE_FUNCTIONS) expect(codes).toContain(f.code);
  });

  it("creates and lists roles scoped to the caller's tenant", async () => {
    const role = await service.createRole("alice", { name: "Designer" });
    expect(role.tenantId).toBe("tenantA");
    // bob (tenant B) does not see alice's role.
    expect(await service.listRoles("bob")).toHaveLength(0);
    expect((await service.listRoles("alice")).map((r) => r.id)).toContain(role.id);
  });

  it("rejects a duplicate role name in the same tenant (409)", async () => {
    await service.createRole("alice", { name: "Designer" });
    await expect(service.createRole("alice", { name: "Designer" })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("hides a role in another tenant (404, no existence leak)", async () => {
    const role = await service.createRole("alice", { name: "Designer" });
    await expect(service.updateRole("bob", role.id, { name: "X" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteRole("bob", role.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses to modify the built-in system admin role (400)", async () => {
    await rbac.ensureTenantAdmin("alice", "tenantA");
    const admin = (await service.listRoles("alice")).find((r) => r.system);
    if (!admin) throw new Error("admin role missing");
    await expect(service.updateRole("alice", admin.id, { name: "X" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects granting an unknown function code (400)", async () => {
    const role = await service.createRole("alice", { name: "Designer" });
    await expect(
      service.setRoleFunctions("alice", role.id, { functions: ["form.manage", "bogus.code"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("sets and clears a role's data-scope org units (C3)", async () => {
    orgUnits.seed("hr", "tenantA", null);
    const role = await service.createRole("alice", { name: "HR Editor" });
    expect(role.dataScopes).toEqual([]); // a fresh role is tenant-wide
    const scoped = await service.setRoleDataScopes("alice", role.id, { orgUnitIds: ["hr"] });
    expect(scoped.dataScopes).toEqual(["hr"]);
    const cleared = await service.setRoleDataScopes("alice", role.id, { orgUnitIds: [] });
    expect(cleared.dataScopes).toEqual([]); // back to tenant-wide
  });

  it("rejects a data-scope org unit from another tenant (400)", async () => {
    orgUnits.seed("sales", "tenantB", null); // lives in bob's tenant
    const role = await service.createRole("alice", { name: "HR Editor" });
    await expect(
      service.setRoleDataScopes("alice", role.id, { orgUnitIds: ["sales"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setRoleDataScopes("alice", role.id, { orgUnitIds: ["ghost"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("audits a data-scope change with tenant + actor (§8 write-side)", async () => {
    orgUnits.seed("hr", "tenantA", null);
    const role = await service.createRole("alice", { name: "HR Editor" });
    await service.setRoleDataScopes("alice", role.id, { orgUnitIds: ["hr"] });
    const entry = audit.entries.find((e) => e.action === "role.set-data-scopes");
    expect(entry).toMatchObject({ tenantId: "tenantA", actorId: "alice", targetId: role.id });
  });

  it("unions functions across a user's roles (1 user, many roles)", async () => {
    tenants.map.set("carol", "tenantA"); // a second member of tenant A
    const r1 = await service.createRole("alice", { name: "Forms" });
    const r2 = await service.createRole("alice", { name: "Flows" });
    await service.setRoleFunctions("alice", r1.id, { functions: ["form.manage"] });
    await service.setRoleFunctions("alice", r2.id, { functions: ["workflow.manage"] });
    await service.setUserRoles("alice", "carol", { roleIds: [r1.id, r2.id] });
    expect((await service.myFunctions("carol")).sort()).toEqual(["form.manage", "workflow.manage"]);
  });

  it("rejects assigning a role from another tenant (400)", async () => {
    const roleA = await service.createRole("alice", { name: "Designer" });
    await expect(
      service.setUserRoles("bob", "bob", { roleIds: [roleA.id] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists the caller's tenant members (D1 user list)", async () => {
    const record = { id: "alice", email: "a@x.dev", displayName: null, roleIds: [] };
    rbac.tenantUsers.set("tenantA", [record]);
    expect(await service.listUsers("alice")).toEqual([record]);
    expect(await service.listUsers("bob")).toEqual([]); // scoped to the caller's tenant
  });

  it("adds an existing user to the caller's tenant by email (idempotent)", async () => {
    users.seed("dave", "dave@x.dev");
    await service.addMember("alice", { email: "  Dave@X.dev " }); // normalized lookup
    await service.addMember("alice", { email: "dave@x.dev" });
    expect(tenants.added).toEqual([{ tenantId: "tenantA", userId: "dave" }]);
    expect(audit.entries.filter((e) => e.action === "member.add")).toHaveLength(2);
  });

  it("404s adding an email with no account (invitations are Phase A2)", async () => {
    await expect(service.addMember("alice", { email: "ghost@x.dev" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s role reads/writes when the target is not a tenant member", async () => {
    await expect(service.getUserRoles("alice", "bob")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setUserRoles("alice", "bob", { roleIds: [] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("assigns roles to a member added from another personal tenant", async () => {
    users.seed("bob", "bob@x.dev");
    await service.addMember("alice", { email: "bob@x.dev" }); // bob joins tenant A
    const role = await service.createRole("alice", { name: "Editor" });
    expect(await service.setUserRoles("alice", "bob", { roleIds: [role.id] })).toEqual([role.id]);
  });

  it("audits sensitive mutations with tenant + actor (§8 write-side)", async () => {
    const role = await service.createRole("alice", { name: "Designer" });
    await service.setRoleFunctions("alice", role.id, { functions: ["form.manage"] });
    await service.updateRole("alice", role.id, { name: "Design" });
    await service.setUserRoles("alice", "alice", { roleIds: [role.id] });
    await service.deleteRole("alice", role.id);
    expect(audit.entries.map((e) => e.action)).toEqual([
      "role.create",
      "role.set-functions",
      "role.update",
      "user.set-roles",
      "role.delete",
    ]);
    for (const e of audit.entries) {
      expect(e.tenantId).toBe("tenantA");
      expect(e.actorId).toBe("alice");
    }
  });

  describe("active tenant (workspace selection)", () => {
    // alice's personal tenant is tenantA; she is also a member of tenantB.
    beforeEach(async () => {
      await tenants.addMember("tenantB", "alice");
    });

    it("administers the selected workspace, not the personal-first default", async () => {
      const inB = await service.createRole("alice", { name: "Designer" }, "tenantB");
      expect(inB.tenantId).toBe("tenantB");
      expect((await service.listRoles("alice", "tenantB")).map((r) => r.id)).toEqual([inB.id]);
      expect(await service.listRoles("alice")).toHaveLength(0); // tenantA is untouched
    });

    it("resolves the caller's functions in the selected workspace", async () => {
      const role = await service.createRole("alice", { name: "Designer" }, "tenantB");
      await service.setRoleFunctions("alice", role.id, { functions: ["form.manage"] }, "tenantB");
      await service.setUserRoles("alice", "alice", { roleIds: [role.id] }, "tenantB");

      expect(await service.myFunctions("alice", "tenantB")).toEqual(["form.manage"]);
      expect(await service.myFunctions("alice")).toEqual([]); // nothing in tenantA
    });

    it("ignores a workspace the caller isn't a member of (falls back, no leak)", async () => {
      const inA = await service.createRole("alice", { name: "Designer" });
      // bob's tenant — alice is not a member, so the header is dropped rather than honoured.
      expect((await service.listRoles("alice", "tenantB-not-mine")).map((r) => r.id)).toEqual([
        inA.id,
      ]);
    });

    it("audits into the selected workspace", async () => {
      audit.entries = [];
      await service.createRole("alice", { name: "Designer" }, "tenantB");
      expect(audit.entries.map((e) => e.tenantId)).toEqual(["tenantB"]);
    });
  });
});
