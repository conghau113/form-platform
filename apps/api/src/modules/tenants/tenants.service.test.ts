import { describe, expect, it } from "vitest";
import { FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { TenantsService } from "./tenants.service.js";

describe("TenantsService (B4)", () => {
  it("lists the caller's tenants with the personal flag and mapped project role", async () => {
    const tenants = new FakeTenantRepo();
    const rbac = new FakeRbacRepo();
    tenants.join("u1", FakeTenantRepo.tenantIdFor("u1"));
    tenants.join("u1", FakeTenantRepo.tenantIdFor("owner"));
    rbac.grant("u1", FakeTenantRepo.tenantIdFor("u1"), ["*"]);
    rbac.grant("u1", FakeTenantRepo.tenantIdFor("owner"), ["form.manage"]);

    const list = await new TenantsService(tenants, rbac).listMine("u1");

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "tnt_u1", personal: true, projectRole: "owner" });
    expect(list[1]).toMatchObject({ id: "tnt_owner", personal: false, projectRole: "editor" });
  });

  it("maps a membership with no role functions to a null project role", async () => {
    const tenants = new FakeTenantRepo();
    const rbac = new FakeRbacRepo();
    tenants.join("u1", FakeTenantRepo.tenantIdFor("owner"));

    const list = await new TenantsService(tenants, rbac).listMine("u1");

    expect(list).toHaveLength(1);
    expect(list[0].projectRole).toBeNull();
  });
});
