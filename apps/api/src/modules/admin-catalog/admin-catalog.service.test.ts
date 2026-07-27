import { describe, expect, it } from "vitest";
import {
  AdminCatalogRepo,
  type AdminFormRow,
  type AdminFormVersionRow,
  type AdminWorkflowInstanceRow,
  type AdminWorkflowRow,
} from "../../persistence/repositories/admin-catalog.repo.js";
import { FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { AdminCatalogService } from "./admin-catalog.service.js";

/** In-memory admin catalog keyed by tenantId — proves the service scopes strictly by tenant. */
class FakeAdminCatalogRepo extends AdminCatalogRepo {
  readonly forms = new Map<string, AdminFormRow[]>();
  readonly workflows = new Map<string, AdminWorkflowRow[]>();
  readonly versions = new Map<string, AdminFormVersionRow[]>();
  readonly instances = new Map<string, AdminWorkflowInstanceRow[]>();

  async listForms(tenantId: string): Promise<AdminFormRow[]> {
    return this.forms.get(tenantId) ?? [];
  }
  async listWorkflows(tenantId: string): Promise<AdminWorkflowRow[]> {
    return this.workflows.get(tenantId) ?? [];
  }
  async listFormVersions(tenantId: string): Promise<AdminFormVersionRow[]> {
    return this.versions.get(tenantId) ?? [];
  }
  async listInstances(tenantId: string): Promise<AdminWorkflowInstanceRow[]> {
    return this.instances.get(tenantId) ?? [];
  }
}

function formRow(id: string): AdminFormRow {
  return {
    id,
    projectId: "p1",
    folderId: null,
    title: id,
    status: null,
    updatedAt: new Date(0),
    projectName: "Project 1",
  };
}

describe("AdminCatalogService (D2–D4)", () => {
  const tenantA = FakeTenantRepo.tenantIdFor("u1");
  const tenantB = FakeTenantRepo.tenantIdFor("other");

  it("lists the caller's tenant catalog (resolved from their membership)", async () => {
    const tenants = new FakeTenantRepo();
    const catalog = new FakeAdminCatalogRepo();
    tenants.join("u1", tenantA);
    catalog.forms.set(tenantA, [formRow("f1"), formRow("f2")]);

    const rows = await new AdminCatalogService(catalog, tenants).listForms("u1");

    expect(rows.map((r) => r.id)).toEqual(["f1", "f2"]);
  });

  it("never returns another tenant's data (cross-tenant isolation, §8 leak test)", async () => {
    const tenants = new FakeTenantRepo();
    const catalog = new FakeAdminCatalogRepo();
    tenants.join("u1", tenantA);
    catalog.forms.set(tenantA, [formRow("mine")]);
    catalog.forms.set(tenantB, [formRow("theirs")]);

    const rows = await new AdminCatalogService(catalog, tenants).listForms("u1");

    expect(rows.map((r) => r.id)).toEqual(["mine"]);
  });

  it("returns an empty list for a caller with no tenant membership (no leak)", async () => {
    const tenants = new FakeTenantRepo();
    const catalog = new FakeAdminCatalogRepo();
    catalog.forms.set(tenantA, [formRow("f1")]);

    const service = new AdminCatalogService(catalog, tenants);

    expect(await service.listForms("ghost")).toEqual([]);
    expect(await service.listWorkflows("ghost")).toEqual([]);
    expect(await service.listFormVersions("ghost")).toEqual([]);
    expect(await service.listInstances("ghost")).toEqual([]);
  });
});
