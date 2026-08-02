import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { RbacRepo, WILDCARD_FUNCTION } from "../persistence/repositories/rbac.repo.js";
import { TenantRepo } from "../persistence/repositories/tenant.repo.js";
import { FakeRbacRepo, FakeTenantRepo } from "../testing/fake-tenant-rbac.js";
import { FunctionGuard } from "./function.guard.js";
import type { AuthedRequest } from "./jwt-payload.js";
import { REQUIRE_FUNCTION_KEY } from "./require-function.decorator.js";

/** RbacRepo stub returning a fixed function set for the caller; other methods are unused. */
class StubRbacRepo extends RbacRepo {
  constructor(private readonly held: string[]) {
    super();
  }
  async resolveFunctions(): Promise<string[]> {
    return this.held;
  }
  async resolveScopedGrants(): Promise<{ functions: string[]; scopeOrgUnitIds: string[] }[]> {
    return [{ functions: this.held, scopeOrgUnitIds: [] }];
  }
  async setRoleDataScopes(): Promise<void> {}
  async listRoleDataScopes(): Promise<never[]> {
    return [];
  }
  async seedFunctions(): Promise<void> {}
  async listFunctions(): Promise<never[]> {
    return [];
  }
  async createRole(): Promise<never> {
    throw new Error("nu");
  }
  async listRoles(): Promise<never[]> {
    return [];
  }
  async findRoleById(): Promise<null> {
    return null;
  }
  async updateRole(): Promise<never> {
    throw new Error("nu");
  }
  async deleteRole(): Promise<void> {}
  async setRoleFunctions(): Promise<void> {}
  async listRoleFunctions(): Promise<never[]> {
    return [];
  }
  async listTenantUsers(): Promise<never[]> {
    return [];
  }
  async setUserRoles(): Promise<void> {}
  async listUserRoleIds(): Promise<never[]> {
    return [];
  }
  async listUserRoleNames(): Promise<never[]> {
    return [];
  }
  async ensureTenantAdmin(): Promise<void> {}
}

class StubTenantRepo extends TenantRepo {
  constructor(private readonly tenantId: string | null) {
    super();
  }
  async ensureTenantForOwner(): Promise<string> {
    return this.tenantId ?? "";
  }
  async ensurePersonalTenant(): Promise<string> {
    return this.tenantId ?? "";
  }
  async findTenantIdForUser(): Promise<string | null> {
    return this.tenantId;
  }
  async listTenantIdsForUser(): Promise<string[]> {
    return this.tenantId ? [this.tenantId] : [];
  }
  async listTenantsForUser(): Promise<never> {
    throw new Error("not used");
  }
  async isMember(): Promise<boolean> {
    return true;
  }
  async addMember(): Promise<void> {}
}

/** Build an ExecutionContext exposing a request with the given principal + a fixed required-metadata. */
function ctx(
  user: AuthedRequest["user"],
  required: string[] | undefined,
  headers: AuthedRequest["headers"] = {},
) {
  const request: AuthedRequest = { user, headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({ [REQUIRE_FUNCTION_KEY]: required }),
    getClass: () => ({}),
    // Reflector reads real metadata off the handler; we bypass by stubbing the reflector below.
  } as never;
}

function guardWith(required: string[] | undefined, held: string[], tenantId: string | null) {
  const reflector = new Reflector();
  reflector.getAllAndOverride = (() => required) as typeof reflector.getAllAndOverride;
  return new FunctionGuard(reflector, new StubRbacRepo(held), new StubTenantRepo(tenantId));
}

describe("FunctionGuard", () => {
  const alice = { sub: "alice", email: "a@x.io" };

  it("allows a route with no @RequireFunction metadata", async () => {
    const guard = guardWith(undefined, [], "tenantA");
    expect(await guard.canActivate(ctx(alice, undefined))).toBe(true);
  });

  it("allows when the caller holds the required function", async () => {
    const guard = guardWith(["role.admin"], ["role.admin"], "tenantA");
    expect(await guard.canActivate(ctx(alice, ["role.admin"]))).toBe(true);
  });

  it("allows the `*` superadmin for any required function", async () => {
    const guard = guardWith(["role.admin"], [WILDCARD_FUNCTION], "tenantA");
    expect(await guard.canActivate(ctx(alice, ["role.admin"]))).toBe(true);
  });

  it("forbids when a required function is missing (403)", async () => {
    const guard = guardWith(["role.admin"], ["form.manage"], "tenantA");
    await expect(guard.canActivate(ctx(alice, ["role.admin"]))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("any-of: allows when the caller holds one of several required functions (D1)", async () => {
    const required = ["role.admin", "user.admin"];
    expect(
      await guardWith(required, ["user.admin"], "tenantA").canActivate(ctx(alice, required)),
    ).toBe(true);
    await expect(
      guardWith(required, ["form.manage"], "tenantA").canActivate(ctx(alice, required)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("401s when there is no authenticated principal", async () => {
    const guard = guardWith(["role.admin"], [], "tenantA");
    await expect(guard.canActivate(ctx(undefined, ["role.admin"]))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("403s when the caller has no tenant", async () => {
    const guard = guardWith(["role.admin"], [], null);
    await expect(guard.canActivate(ctx(alice, ["role.admin"]))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe("FunctionGuard active tenant (X-Tenant-Id)", () => {
  const bob = { sub: "bob", email: "b@x.io" };
  const PERSONAL = "tnt_bob";
  const TEAM = "tnt_team";
  const required = ["role.admin"];

  /** Bob is an admin in the team tenant but holds nothing in his personal one (joined first). */
  function guard() {
    const tenants = new FakeTenantRepo();
    tenants.join("bob", PERSONAL);
    tenants.join("bob", TEAM);
    const rbac = new FakeRbacRepo();
    rbac.grant("bob", PERSONAL, []);
    rbac.grant("bob", TEAM, ["role.admin"]);
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => required) as typeof reflector.getAllAndOverride;
    return new FunctionGuard(reflector, rbac, tenants);
  }

  it("gates on the requested workspace, not the personal-first default", async () => {
    expect(await guard().canActivate(ctx(bob, required, { "x-tenant-id": TEAM }))).toBe(true);
  });

  it("falls back to the personal-first default when no workspace is requested", async () => {
    await expect(guard().canActivate(ctx(bob, required))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("ignores a workspace the caller is not a member of (no privilege widening)", async () => {
    await expect(
      guard().canActivate(ctx(bob, required, { "x-tenant-id": "tnt_someone_else" })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
