import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type OrgUnitCreateInput,
  type OrgUnitRecord,
  OrgUnitRepo,
  type OrgUnitUpdateInput,
} from "../../persistence/repositories/org-unit.repo.js";
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import { OrgUnitsService } from "./org-units.service.js";

let seq = 0;

/** In-memory OrgUnitRepo mirroring the Prisma tenant-scoped tree + cascade/count semantics. */
class FakeOrgUnitRepo extends OrgUnitRepo {
  readonly rows: OrgUnitRecord[] = [];

  async create(input: OrgUnitCreateInput): Promise<OrgUnitRecord> {
    const row: OrgUnitRecord = {
      id: `ou${++seq}`,
      tenantId: input.tenantId,
      parentId: input.parentId ?? null,
      name: input.name,
      kind: input.kind ?? null,
      order: input.order ?? 0,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async list(tenantId: string): Promise<OrgUnitRecord[]> {
    return this.rows.filter((r) => r.tenantId === tenantId);
  }
  async findById(id: string): Promise<OrgUnitRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async update(id: string, patch: OrgUnitUpdateInput): Promise<OrgUnitRecord> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("no row");
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.order !== undefined) row.order = patch.order;
    if (patch.parentId !== undefined) row.parentId = patch.parentId;
    return row;
  }
  async delete(id: string): Promise<void> {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i >= 0) this.rows.splice(i, 1);
  }
  async countChildren(id: string): Promise<{ units: number; members: number }> {
    return { units: this.rows.filter((r) => r.parentId === id).length, members: 0 };
  }
}

/** In-memory TenantRepo — only the read path used here matters (user → tenant map). */
class FakeTenantRepo extends TenantRepo {
  constructor(private readonly map: Record<string, string>) {
    super();
  }
  async ensureTenantForOwner(ownerId: string): Promise<string> {
    return this.map[ownerId] ?? `t-${ownerId}`;
  }
  async ensurePersonalTenant(userId: string): Promise<string> {
    return this.ensureTenantForOwner(userId);
  }
  async findTenantIdForUser(userId: string): Promise<string | null> {
    return this.map[userId] ?? null;
  }
  async isMember(userId: string, tenantId: string): Promise<boolean> {
    return this.map[userId] === tenantId;
  }
  async addMember(): Promise<void> {}
}

describe("OrgUnitsService", () => {
  // userA ∈ tenant A, userB ∈ tenant B (personal tenants).
  const USER_A = "userA";
  const USER_B = "userB";
  let units: FakeOrgUnitRepo;
  let service: OrgUnitsService;

  beforeEach(() => {
    units = new FakeOrgUnitRepo();
    service = new OrgUnitsService(
      units,
      new FakeTenantRepo({ [USER_A]: "tenA", [USER_B]: "tenB" }),
    );
  });

  it("creates units in the caller's tenant and lists only that tenant's units", async () => {
    const root = await service.create(USER_A, { name: "  HQ  ", kind: "organization" });
    expect(root.tenantId).toBe("tenA");
    expect(root.name).toBe("HQ"); // trimmed
    await service.create(USER_A, { name: "Dept 1", parentId: root.id });
    await service.create(USER_B, { name: "Other tenant unit" });

    const listA = await service.list(USER_A);
    expect(listA.map((u) => u.name).sort()).toEqual(["Dept 1", "HQ"]);
    const listB = await service.list(USER_B);
    expect(listB.map((u) => u.name)).toEqual(["Other tenant unit"]);
  });

  it("rejects an empty name and a parent from another tenant", async () => {
    await expect(service.create(USER_A, { name: "  " })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const bUnit = await service.create(USER_B, { name: "B root" });
    await expect(
      service.create(USER_A, { name: "child", parentId: bUnit.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enforces tenant isolation: user B cannot read/update/delete user A's unit (404)", async () => {
    const aUnit = await service.create(USER_A, { name: "A secret" });
    await expect(service.update(USER_B, aUnit.id, { name: "hijack" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(USER_B, aUnit.id, false)).rejects.toBeInstanceOf(NotFoundException);
    // untouched
    expect((await units.findById(aUnit.id))?.name).toBe("A secret");
  });

  it("blocks a move that would create a cycle (409)", async () => {
    const root = await service.create(USER_A, { name: "root" });
    const child = await service.create(USER_A, { name: "child", parentId: root.id });
    // Re-parent root under its own child → cycle.
    await expect(service.update(USER_A, root.id, { parentId: child.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("blocks deleting a non-empty unit unless cascade is set", async () => {
    const root = await service.create(USER_A, { name: "root" });
    await service.create(USER_A, { name: "child", parentId: root.id });
    await expect(service.remove(USER_A, root.id, false)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(USER_A, root.id, true)).resolves.toBeUndefined();
  });
});
