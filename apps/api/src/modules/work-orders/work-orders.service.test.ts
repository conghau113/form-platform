import { beforeEach, describe, expect, it } from "vitest";
import type {
  FolderChildCounts,
  FolderRecord,
} from "../../persistence/repositories/folder.repo.js";
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import {
  type ProjectCreateInput,
  type ProjectRecord,
  ProjectRepo,
} from "../../persistence/repositories/project.repo.js";
import {
  type MemberRole,
  type ProjectMemberRecord,
  ProjectMemberRepo,
} from "../../persistence/repositories/project-member.repo.js";
import {
  WorkflowRepo,
  type WorkflowSummary,
} from "../../persistence/repositories/workflow.repo.js";
import {
  WorkflowInstanceRepo,
  type WorkOrderFilter,
  type WorkOrderPage,
  type WorkOrderRow,
} from "../../persistence/repositories/workflow-instance.repo.js";
import { FakeOrgUnitRepo, FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { ProjectsService } from "../projects/projects.service.js";
import { WorkOrdersService } from "./work-orders.service.js";

let seq = 0;

/**
 * In-memory case index. Filtering/paging is implemented here the same way the Prisma repo does it,
 * so the service tests assert on *which projects* reach the query — the access question — rather
 * than on SQL.
 */
class FakeWorkflowInstanceRepo extends WorkflowInstanceRepo {
  readonly rows: WorkOrderRow[] = [];
  /** Last `projectIds` the service asked for — the scoping assertion. */
  lastProjectIds: string[] = [];
  /** Last filter the service built — how the HTTP surface translated into repo terms. */
  lastFilter: WorkOrderFilter | null = null;

  seed(row: Partial<WorkOrderRow> & { id: string; projectId: string }): void {
    this.rows.push({
      workflowId: "wf1",
      current: "draft",
      label: row.id,
      assigneeId: null,
      statusLabel: "Nháp",
      statusKind: "normal",
      dueAt: null,
      priority: 2,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      workflowTitle: "WF",
      projectName: "P",
      assigneeName: null,
      ...row,
    });
  }

  async listByProjects(
    projectIds: string[],
    filter: WorkOrderFilter,
    page: WorkOrderPage,
  ): Promise<{ rows: WorkOrderRow[]; total: number }> {
    this.lastProjectIds = projectIds;
    this.lastFilter = filter;
    const matched = this.rows.filter(
      (r) =>
        projectIds.includes(r.projectId) &&
        (!filter.workflowId || r.workflowId === filter.workflowId) &&
        (!filter.statusKind || r.statusKind === filter.statusKind) &&
        (!filter.unassigned || r.assigneeId === null) &&
        (!filter.assigneeId || r.assigneeId === filter.assigneeId) &&
        (!filter.search || (r.label ?? "").includes(filter.search)) &&
        (!filter.priority || r.priority === filter.priority) &&
        // Mirrors the Prisma branch, INCLUDING that a null `statusKind` counts as "not finished".
        (!filter.overdueBefore ||
          (r.dueAt !== null && r.dueAt < filter.overdueBefore && r.statusKind !== "end")),
    );
    return { rows: matched.slice(page.offset, page.offset + page.limit), total: matched.length };
  }
  async update(): Promise<never> {
    throw new Error("not used");
  }
  async create(): Promise<never> {
    throw new Error("not used — see workflow-instances.service.test.ts");
  }
  async load(): Promise<null> {
    return null;
  }
  async findSummary(): Promise<null> {
    return null;
  }
  async listByWorkflow(): Promise<never[]> {
    return [];
  }
  async setAssignee(): Promise<void> {}
  async setWorkOrderFields(): Promise<void> {}
  async delete(): Promise<void> {}
}

class FakeWorkflowRepo extends WorkflowRepo {
  readonly summaries: WorkflowSummary[] = [];
  async listByProjects(projectIds: string[]): Promise<WorkflowSummary[]> {
    return this.summaries.filter((s) => projectIds.includes(s.projectId));
  }
  async upsert(): Promise<never> {
    throw new Error("not used");
  }
  async load(): Promise<null> {
    return null;
  }
  async findSummary(): Promise<null> {
    return null;
  }
  async listSummaries(): Promise<never[]> {
    return [];
  }
  async move(): Promise<null> {
    return null;
  }
  async delete(): Promise<void> {}
}

class FakeProjectRepo extends ProjectRepo {
  readonly rows = new Map<string, ProjectRecord>();
  async create(input: ProjectCreateInput): Promise<ProjectRecord> {
    const now = new Date();
    const row: ProjectRecord = {
      id: `proj_${++seq}`,
      ownerId: input.ownerId,
      tenantId: input.tenantId ?? FakeTenantRepo.tenantIdFor(input.ownerId),
      orgUnitId: input.orgUnitId ?? null,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async ensureUnfiled(ownerId: string): Promise<ProjectRecord> {
    return this.create({ ownerId, name: "Unfiled", slug: "unfiled" });
  }
  async list(ownerId: string): Promise<ProjectRecord[]> {
    return [...this.rows.values()].filter((p) => p.ownerId === ownerId);
  }
  async findById(id: string): Promise<ProjectRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async findByIds(ids: string[]): Promise<ProjectRecord[]> {
    return ids.map((id) => this.rows.get(id)).filter((p): p is ProjectRecord => p != null);
  }
  async listByTenants(tenantIds: string[]): Promise<ProjectRecord[]> {
    return [...this.rows.values()].filter((p) => tenantIds.includes(p.tenantId));
  }
  async update(): Promise<never> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
}

class FakeProjectMemberRepo extends ProjectMemberRepo {
  readonly rows = new Map<string, ProjectMemberRecord>();
  private key(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }
  async listByProject(): Promise<never[]> {
    return [];
  }
  async listProjectIdsForUser(userId: string): Promise<string[]> {
    return [...this.rows.values()].filter((m) => m.userId === userId).map((m) => m.projectId);
  }
  async find(projectId: string, userId: string): Promise<ProjectMemberRecord | null> {
    return this.rows.get(this.key(projectId, userId)) ?? null;
  }
  async upsert(input: {
    projectId: string;
    userId: string;
    role: MemberRole;
  }): Promise<ProjectMemberRecord> {
    const row: ProjectMemberRecord = { ...input, createdAt: new Date() };
    this.rows.set(this.key(input.projectId, input.userId), row);
    return row;
  }
  async remove(): Promise<boolean> {
    return false;
  }
}

class UnusedFolderRepo extends FolderRepo {
  async create(): Promise<never> {
    throw new Error("not used");
  }
  async list(): Promise<never[]> {
    return [];
  }
  async findById(): Promise<FolderRecord | null> {
    return null;
  }
  async update(): Promise<never> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
  async countChildren(): Promise<FolderChildCounts> {
    return { folders: 0, forms: 0 };
  }
}

class UnusedFormRepo extends FormRepo {
  async upsert(): Promise<never> {
    throw new Error("not used");
  }
  async load(): Promise<null> {
    return null;
  }
  async findSummary(): Promise<null> {
    return null;
  }
  async listSummaries(): Promise<never[]> {
    return [];
  }
  async move(): Promise<null> {
    return null;
  }
  async delete(): Promise<void> {}
}

const OWNER = "owner-a";
const OPERATOR = "operator-1";
const OUTSIDER = "outsider-1";
const TENANT = FakeTenantRepo.tenantIdFor(OWNER);
const OTHER_TENANT = "tnt_other";

let instances: FakeWorkflowInstanceRepo;
let workflows: FakeWorkflowRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let tenants: FakeTenantRepo;
let rbac: FakeRbacRepo;
let service: WorkOrdersService;
let project: ProjectRecord;

const page: WorkOrderPage = { offset: 0, limit: 20, sort: "updatedAt", dir: "desc" };

beforeEach(async () => {
  seq = 0;
  instances = new FakeWorkflowInstanceRepo();
  workflows = new FakeWorkflowRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  tenants = new FakeTenantRepo();
  rbac = new FakeRbacRepo();
  const projects = new ProjectsService(
    projectRepo,
    new UnusedFolderRepo(),
    new UnusedFormRepo(),
    memberRepo,
    tenants,
    rbac,
    new FakeOrgUnitRepo(),
  );
  service = new WorkOrdersService(
    instances,
    workflows,
    projects,
    tenants,
    rbac,
    new FakeOrgUnitRepo(),
    memberRepo,
  );

  tenants.join(OWNER, TENANT);
  rbac.grant(OWNER, TENANT, ["*"]);
  project = await projectRepo.create({ ownerId: OWNER, name: "P", slug: "p" });
});

describe("WorkOrdersService.list — scoping (Phase E)", () => {
  it("lists the cases of projects the caller can see in the active workspace", async () => {
    instances.seed({ id: "c1", projectId: project.id });
    const result = await service.list(OWNER, { page }, TENANT);
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe("c1");
    expect(instances.lastProjectIds).toEqual([project.id]);
  });

  it("never queries another tenant's projects (§8 cross-tenant isolation)", async () => {
    const foreign = await projectRepo.create({
      ownerId: "someone-else",
      tenantId: OTHER_TENANT,
      name: "Foreign",
      slug: "foreign",
    });
    instances.seed({ id: "foreign-case", projectId: foreign.id });

    const result = await service.list(OWNER, { page }, TENANT);
    expect(instances.lastProjectIds).not.toContain(foreign.id);
    expect(result.rows).toEqual([]);
  });

  it("excludes a W5-shared project living in ANOTHER workspace", async () => {
    // ProjectsService.list deliberately never tenant-filters person-to-person shares; the work-order
    // screen must, or its assignee picker (drawn from THIS workspace) could never assign the row.
    const foreign = await projectRepo.create({
      ownerId: "someone-else",
      tenantId: OTHER_TENANT,
      name: "Foreign",
      slug: "foreign",
    });
    await memberRepo.upsert({ projectId: foreign.id, userId: OWNER, role: "editor" });
    instances.seed({ id: "shared-case", projectId: foreign.id });

    const result = await service.list(OWNER, { page }, TENANT);
    expect(result.rows).toEqual([]);
  });

  it("returns nothing for a user with no tenant at all", async () => {
    instances.seed({ id: "c1", projectId: project.id });
    const result = await service.list(OUTSIDER, { page });
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it("hides a project the caller's grants do not reach (C3 data scope)", async () => {
    tenants.join(OPERATOR, TENANT);
    rbac.grantScoped(OPERATOR, TENANT, [
      { functions: ["workflow.run"], scopeOrgUnitIds: ["other-unit"] },
    ]);
    const placed = await projectRepo.create({
      ownerId: OWNER,
      name: "Placed",
      slug: "placed",
      orgUnitId: "eng",
    });
    instances.seed({ id: "scoped-case", projectId: placed.id });

    const result = await service.list(OPERATOR, { page }, TENANT);
    expect(result.rows).toEqual([]);
  });
});

describe("WorkOrdersService.list — filters and paging (Phase E)", () => {
  beforeEach(() => {
    instances.seed({ id: "c1", projectId: project.id, assigneeId: OPERATOR, label: "Alpha" });
    instances.seed({ id: "c2", projectId: project.id, label: "Beta" });
    instances.seed({
      id: "c3",
      projectId: project.id,
      assigneeId: OWNER,
      label: "Gamma",
      statusKind: "end",
    });
  });

  it("resolves the `me` sentinel to the caller", async () => {
    const result = await service.list(OWNER, { assignee: "me", page }, TENANT);
    expect(result.rows.map((r) => r.id)).toEqual(["c3"]);
  });

  it("resolves the `none` sentinel to unassigned cases", async () => {
    const result = await service.list(OWNER, { assignee: "none", page }, TENANT);
    expect(result.rows.map((r) => r.id)).toEqual(["c2"]);
  });

  it("filters by a specific assignee, status kind and label search", async () => {
    await expect(service.list(OWNER, { assignee: OPERATOR, page }, TENANT)).resolves.toMatchObject({
      total: 1,
    });
    await expect(service.list(OWNER, { statusKind: "end", page }, TENANT)).resolves.toMatchObject({
      total: 1,
    });
    await expect(service.list(OWNER, { search: "Bet", page }, TENANT)).resolves.toMatchObject({
      total: 1,
    });
  });

  it("pages the rows while reporting the unpaged total", async () => {
    const result = await service.list(OWNER, { page: { ...page, offset: 1, limit: 1 } }, TENANT);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
  });
});

describe("WorkOrdersService.list — deadline and urgency filters (Phase E2)", () => {
  const past = new Date("2020-01-01T00:00:00.000Z");
  const future = new Date("2999-01-01T00:00:00.000Z");

  beforeEach(() => {
    instances.seed({ id: "late", projectId: project.id, dueAt: past, priority: 3 });
    instances.seed({ id: "later", projectId: project.id, dueAt: future, priority: 1 });
    instances.seed({ id: "undated", projectId: project.id });
    // A case written before Phase E denormalized the status — the NULL that a naive
    // `statusKind <> 'end'` would drop from the overdue list.
    instances.seed({ id: "legacy", projectId: project.id, dueAt: past, statusKind: null });
    instances.seed({ id: "done", projectId: project.id, dueAt: past, statusKind: "end" });
  });

  it("filters by exact urgency", async () => {
    const result = await service.list(OWNER, { priority: 3, page }, TENANT);
    expect(result.rows.map((r) => r.id)).toEqual(["late"]);
  });

  it("keeps only unfinished cases past their deadline — including ones with no status yet", async () => {
    const result = await service.list(OWNER, { overdue: true, page }, TENANT);
    expect(result.rows.map((r) => r.id)).toEqual(["late", "legacy"]);
  });

  it("turns the caller's yes/no into a cutoff instant, so the filter can never lose its clock", async () => {
    await service.list(OWNER, { overdue: true, page }, TENANT);
    expect(instances.lastFilter?.overdueBefore).toBeInstanceOf(Date);

    await service.list(OWNER, { page }, TENANT);
    expect(instances.lastFilter?.overdueBefore).toBeUndefined();
  });
});

describe("WorkOrdersService — canRun and pickers (Phase E)", () => {
  it("marks rows runnable for the project owner and for a workflow.run grant", async () => {
    instances.seed({ id: "c1", projectId: project.id });
    await expect(service.list(OWNER, { page }, TENANT)).resolves.toMatchObject({
      rows: [expect.objectContaining({ canRun: true })],
    });

    tenants.join(OPERATOR, TENANT);
    rbac.grant(OPERATOR, TENANT, ["workflow.run"]);
    await expect(service.list(OPERATOR, { page }, TENANT)).resolves.toMatchObject({
      rows: [expect.objectContaining({ canRun: true })],
    });
  });

  it("marks a read-only member's rows not runnable, so the UI can disable assigning", async () => {
    instances.seed({ id: "c1", projectId: project.id });
    tenants.join(OPERATOR, TENANT);
    rbac.grant(OPERATOR, TENANT, ["workflow.read"]);

    const result = await service.list(OPERATOR, { page }, TENANT);
    expect(result.rows).toMatchObject([expect.objectContaining({ canRun: false })]);
  });

  it("counts a W5 editor share inside the workspace as runnable", async () => {
    instances.seed({ id: "c1", projectId: project.id });
    tenants.join(OPERATOR, TENANT);
    rbac.grant(OPERATOR, TENANT, ["workflow.read"]);
    await memberRepo.upsert({ projectId: project.id, userId: OPERATOR, role: "editor" });

    const result = await service.list(OPERATOR, { page }, TENANT);
    expect(result.rows).toMatchObject([expect.objectContaining({ canRun: true })]);
  });

  it("offers only workflows in projects the caller may run", async () => {
    workflows.summaries.push({
      id: "wf1",
      projectId: project.id,
      folderId: null,
      title: "WF",
      status: null,
      updatedAt: new Date(0),
    });
    await expect(service.runnableWorkflows(OWNER, TENANT)).resolves.toHaveLength(1);

    tenants.join(OPERATOR, TENANT);
    rbac.grant(OPERATOR, TENANT, ["workflow.read"]);
    await expect(service.runnableWorkflows(OPERATOR, TENANT)).resolves.toEqual([]);
  });
});

describe("WorkOrdersService.assignees (Phase E)", () => {
  it("offers the members of the active workspace", async () => {
    rbac.setTenantUsers(TENANT, [
      { id: OWNER, email: "owner@example.com", displayName: "Owner", roleIds: [] },
    ]);
    await expect(service.assignees(OWNER, TENANT)).resolves.toEqual([
      { id: OWNER, email: "owner@example.com", displayName: "Owner" },
    ]);
  });

  it("offers nobody when the caller has no workspace", async () => {
    await expect(service.assignees(OUTSIDER)).resolves.toEqual([]);
  });
});
