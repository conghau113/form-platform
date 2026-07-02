import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { deriveCaseLabel } from "@org/workflow-core";
import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
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
  type WorkflowListQuery,
  WorkflowRepo,
  type WorkflowSummary,
  type WorkflowUpsertMeta,
} from "../../persistence/repositories/workflow.repo.js";
import {
  type WorkflowInstanceMeta,
  WorkflowInstanceRepo,
  type WorkflowInstanceSummary,
} from "../../persistence/repositories/workflow-instance.repo.js";
import { FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { ProjectsService } from "../projects/projects.service.js";
import { WorkflowInstancesService } from "./workflow-instances.service.js";

let seq = 0;

/** Approval workflow: draft --submit--> review --approve(role+guard)--> done. */
function def(id = "wf1"): WorkflowDefinition {
  return {
    workflowVersion: 1,
    id,
    title: "Approval",
    start: "draft",
    nodes: [
      { id: "draft", status: "draft" },
      { id: "review", status: "review" },
      { id: "done", status: "done" },
    ],
    transitions: [
      { id: "t1", from: "draft", to: "review", action: "submit" },
      {
        id: "t2",
        from: "review",
        to: "done",
        action: "approve",
        role: "manager",
        guard: { rule: { "==": [{ var: "approved" }, true] } },
      },
    ],
  };
}

/** A graph-invalid definition (start node does not exist) — passes schema, fails `validateGraph`. */
function brokenDef(id = "bad"): WorkflowDefinition {
  return {
    workflowVersion: 1,
    id,
    title: "Broken",
    start: "ghost",
    nodes: [{ id: "draft", status: "draft" }],
    transitions: [],
  };
}

class FakeWorkflowRepo extends WorkflowRepo {
  readonly bodies = new Map<string, WorkflowDefinition>();
  readonly summaries = new Map<string, WorkflowSummary>();
  async upsert(d: WorkflowDefinition, meta: WorkflowUpsertMeta): Promise<WorkflowDefinition> {
    this.bodies.set(d.id, d);
    this.summaries.set(d.id, {
      id: d.id,
      projectId: meta.projectId,
      folderId: meta.folderId ?? null,
      title: d.title,
      status: null,
      updatedAt: new Date(),
    });
    return d;
  }
  async load(id: string): Promise<WorkflowDefinition | null> {
    return this.bodies.get(id) ?? null;
  }
  async findSummary(id: string): Promise<WorkflowSummary | null> {
    return this.summaries.get(id) ?? null;
  }
  async listSummaries(query: WorkflowListQuery): Promise<WorkflowSummary[]> {
    return [...this.summaries.values()].filter((s) => s.projectId === query.projectId);
  }
  async move(): Promise<null> {
    return null;
  }
  async delete(id: string): Promise<void> {
    this.bodies.delete(id);
    this.summaries.delete(id);
  }
}

class FakeWorkflowInstanceRepo extends WorkflowInstanceRepo {
  readonly bodies = new Map<string, WorkflowInstance>();
  readonly meta = new Map<string, WorkflowInstanceMeta>();
  readonly updatedAt = new Map<string, Date>();
  async upsert(instance: WorkflowInstance, meta: WorkflowInstanceMeta): Promise<WorkflowInstance> {
    this.bodies.set(instance.id, instance);
    this.meta.set(instance.id, meta);
    this.updatedAt.set(instance.id, new Date());
    return instance;
  }
  async load(id: string): Promise<WorkflowInstance | null> {
    return this.bodies.get(id) ?? null;
  }
  async findSummary(id: string): Promise<WorkflowInstanceSummary | null> {
    const instance = this.bodies.get(id);
    const meta = this.meta.get(id);
    if (!instance || !meta) return null;
    return {
      id,
      workflowId: meta.workflowId,
      projectId: meta.projectId,
      current: instance.current,
      label: deriveCaseLabel(instance.data) ?? null,
      createdAt: this.updatedAt.get(id) ?? new Date(),
      updatedAt: this.updatedAt.get(id) ?? new Date(),
    };
  }
  async listByWorkflow(workflowId: string): Promise<WorkflowInstanceSummary[]> {
    const out: WorkflowInstanceSummary[] = [];
    for (const [id, meta] of this.meta) {
      if (meta.workflowId !== workflowId) continue;
      const s = await this.findSummary(id);
      if (s) out.push(s);
    }
    return out;
  }
  async delete(id: string): Promise<void> {
    this.bodies.delete(id);
    this.meta.delete(id);
  }
}

class FakeProjectRepo extends ProjectRepo {
  readonly rows = new Map<string, ProjectRecord>();
  async ensureUnfiled(ownerId: string): Promise<ProjectRecord> {
    return this.create({ ownerId, name: "Unfiled", slug: "unfiled" });
  }
  async create(input: ProjectCreateInput): Promise<ProjectRecord> {
    const now = new Date();
    const row: ProjectRecord = {
      id: `proj_${++seq}`,
      ownerId: input.ownerId,
      tenantId: FakeTenantRepo.tenantIdFor(input.ownerId),
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
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
  async update(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
}

class FakeFolderRepo extends FolderRepo {
  async create(): Promise<never> {
    throw new Error("not used");
  }
  async list(): Promise<never> {
    throw new Error("not used");
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

class FakeProjectMemberRepo extends ProjectMemberRepo {
  readonly rows = new Map<string, ProjectMemberRecord>();
  private key(p: string, u: string) {
    return `${p}:${u}`;
  }
  async listByProject(projectId: string): Promise<ProjectMemberRecord[]> {
    return [...this.rows.values()].filter((m) => m.projectId === projectId);
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
  async remove(projectId: string, userId: string): Promise<boolean> {
    return this.rows.delete(this.key(projectId, userId));
  }
}

const OWNER = "owner-a";
let instanceRepo: FakeWorkflowInstanceRepo;
let workflowRepo: FakeWorkflowRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let service: WorkflowInstancesService;
let project: ProjectRecord;

/** Seed a workflow `def` into the project so it can be started. */
async function seedWorkflow(d = def()): Promise<void> {
  await workflowRepo.upsert(d, { projectId: project.id });
}

/** Start a case and advance it to `review` (the role+guard gate is on the next transition). */
async function startAtReview(): Promise<WorkflowInstance> {
  const started = await service.start(OWNER, "wf1");
  return service.advance(OWNER, started.id, { action: "submit" });
}

beforeEach(async () => {
  seq = 0;
  instanceRepo = new FakeWorkflowInstanceRepo();
  workflowRepo = new FakeWorkflowRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  const projects = new ProjectsService(
    projectRepo,
    new FakeFolderRepo(),
    new UnusedFormRepo(),
    memberRepo,
    new FakeTenantRepo(),
    new FakeRbacRepo(),
  );
  service = new WorkflowInstancesService(instanceRepo, workflowRepo, projects);
  project = await projectRepo.create({ ownerId: OWNER, name: "P", slug: "p" });
});

describe("WorkflowInstancesService", () => {
  it("starts a case at the definition's start node and persists it", async () => {
    await seedWorkflow();
    const instance = await service.start(OWNER, "wf1");
    expect(instance.current).toBe("draft");
    expect(instance.history).toHaveLength(0);
    expect(instance.definitionId).toBe("wf1");
    await expect(service.load(OWNER, instance.id)).resolves.toMatchObject({ current: "draft" });
  });

  it("seeds case data on start", async () => {
    await seedWorkflow();
    const instance = await service.start(OWNER, "wf1", { data: { applicant: "Mai" } });
    expect(instance.data).toMatchObject({ applicant: "Mai" });
  });

  it("refuses to start a graph-invalid workflow (422)", async () => {
    await workflowRepo.upsert(brokenDef("bad"), { projectId: project.id });
    await expect(service.start(OWNER, "bad")).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("404s starting an unknown workflow id", async () => {
    await expect(service.start(OWNER, "ghost")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("hides a workflow from a non-member on start (404, no existence leak)", async () => {
    await seedWorkflow();
    await expect(service.start("stranger", "wf1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lets a viewer read cases but not start one (403)", async () => {
    await seedWorkflow();
    await memberRepo.upsert({ projectId: project.id, userId: "viewer-u", role: "viewer" });
    await expect(service.start("viewer-u", "wf1")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list("viewer-u", "wf1")).resolves.toEqual([]);
  });

  it("advances along a transition, appending history and persisting", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    const advanced = await service.advance(OWNER, started.id, { action: "submit" });
    expect(advanced.current).toBe("review");
    expect(advanced.history).toHaveLength(1);
    expect(advanced.history[0]).toMatchObject({ from: "draft", to: "review", action: "submit" });
    await expect(service.load(OWNER, started.id)).resolves.toMatchObject({ current: "review" });
  });

  it("passes a guarded+roled transition when role and data satisfy it", async () => {
    await seedWorkflow();
    const review = await startAtReview();
    const done = await service.advance(OWNER, review.id, {
      action: "approve",
      roles: ["manager"],
      data: { approved: true },
    });
    expect(done.current).toBe("done");
    expect(done.data).toMatchObject({ approved: true });
  });

  it("rejects a guarded transition whose guard fails (422 guard-failed)", async () => {
    await seedWorkflow();
    const review = await startAtReview();
    await expect(
      service.advance(OWNER, review.id, {
        action: "approve",
        roles: ["manager"],
        data: { approved: false },
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects a transition the actor lacks the role for (422 role-denied)", async () => {
    await seedWorkflow();
    const review = await startAtReview();
    await expect(
      service.advance(OWNER, review.id, { action: "approve", data: { approved: true } }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects an action with no matching transition (422 no-transition)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await expect(service.advance(OWNER, started.id, { action: "teleport" })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it("404s loading or advancing an unknown instance id", async () => {
    await seedWorkflow();
    await expect(service.load(OWNER, "ghost")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.advance(OWNER, "ghost", { action: "submit" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("lists a workflow's cases, hiding them from a non-member (404)", async () => {
    await seedWorkflow();
    await service.start(OWNER, "wf1");
    await service.start(OWNER, "wf1", { id: "wf1-case-2" });
    await expect(service.list(OWNER, "wf1")).resolves.toHaveLength(2);
    await expect(service.list("stranger", "wf1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
