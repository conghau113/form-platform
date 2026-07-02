import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { BASE_FUNCTIONS } from "../../auth/function-catalog.js";
import {
  type FunctionRecord,
  type FunctionSeed,
  RbacRepo,
  type RoleCreateInput,
  type RoleRecord,
  type RoleUpdateInput,
  WILDCARD_FUNCTION,
} from "../../persistence/repositories/rbac.repo.js";
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
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
  async ensureTenantAdmin(userId: string, tenantId: string): Promise<void> {
    const role = await this.createRole({ tenantId, name: "Admin", system: true });
    await this.setRoleFunctions(role.id, [WILDCARD_FUNCTION]);
    this.userRoles.set(userId, new Set([...(this.userRoles.get(userId) ?? []), role.id]));
  }
}

/** Two users in two tenants: alice→tenant A, bob→tenant B. */
class FakeTenantRepo extends TenantRepo {
  map = new Map<string, string>([
    ["alice", "tenantA"],
    ["bob", "tenantB"],
  ]);
  async ensureTenantForOwner(ownerId: string): Promise<string> {
    return this.map.get(ownerId) ?? ownerId;
  }
  async ensurePersonalTenant(userId: string): Promise<string> {
    return this.map.get(userId) ?? userId;
  }
  async findTenantIdForUser(userId: string): Promise<string | null> {
    return this.map.get(userId) ?? null;
  }
}

describe("RbacService", () => {
  let rbac: FakeRbacRepo;
  let tenants: FakeTenantRepo;
  let service: RbacService;

  beforeEach(async () => {
    rbac = new FakeRbacRepo();
    tenants = new FakeTenantRepo();
    service = new RbacService(rbac, tenants);
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
});
