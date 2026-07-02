import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { WorkflowDefinition } from "@org/workflow-schema";
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
import { FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { ProjectsService } from "../projects/projects.service.js";
import { WorkflowsService } from "./workflows.service.js";

let seq = 0;

/** A minimal valid workflow definition (v1). */
function def(id = "wf1"): WorkflowDefinition {
  return {
    workflowVersion: 1,
    id,
    title: "Approval",
    start: "draft",
    nodes: [
      { id: "draft", status: "draft" },
      { id: "done", status: "done" },
    ],
    transitions: [{ id: "t1", from: "draft", to: "done", action: "submit" }],
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
    return [...this.summaries.values()].filter(
      (s) =>
        s.projectId === query.projectId &&
        (query.folderId === undefined || s.folderId === query.folderId),
    );
  }
  async move(id: string, folderId: string | null): Promise<WorkflowSummary | null> {
    const s = this.summaries.get(id);
    if (!s) return null;
    const next = { ...s, folderId };
    this.summaries.set(id, next);
    return next;
  }
  async delete(id: string): Promise<void> {
    this.bodies.delete(id);
    this.summaries.delete(id);
  }
}

class FakeProjectRepo extends ProjectRepo {
  readonly rows = new Map<string, ProjectRecord>();
  async ensureUnfiled(ownerId: string): Promise<ProjectRecord> {
    const existing = [...this.rows.values()].find(
      (p) => p.ownerId === ownerId && p.slug === "unfiled",
    );
    if (existing) return existing;
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
  readonly rows = new Map<string, FolderRecord>();
  seed(projectId: string, id = "fold1"): FolderRecord {
    const row: FolderRecord = {
      id,
      projectId,
      parentId: null,
      name: id,
      order: 0,
      createdAt: new Date(),
    };
    this.rows.set(id, row);
    return row;
  }
  async create(): Promise<never> {
    throw new Error("not used");
  }
  async list(): Promise<never> {
    throw new Error("not used");
  }
  async findById(id: string): Promise<FolderRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async update(): Promise<never> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
  async countChildren(): Promise<FolderChildCounts> {
    return { folders: 0, forms: 0 };
  }
}

/** ProjectsService needs a FormRepo, but none of the workflow paths under test touch it. */
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
let workflowRepo: FakeWorkflowRepo;
let folderRepo: FakeFolderRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let workflows: WorkflowsService;
let project: ProjectRecord;

beforeEach(async () => {
  seq = 0;
  workflowRepo = new FakeWorkflowRepo();
  folderRepo = new FakeFolderRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  const projects = new ProjectsService(
    projectRepo,
    folderRepo,
    new UnusedFormRepo(),
    memberRepo,
    new FakeTenantRepo(),
    new FakeRbacRepo(),
  );
  workflows = new WorkflowsService(workflowRepo, folderRepo, projectRepo, projects);
  project = await projectRepo.create({ ownerId: OWNER, name: "P", slug: "p" });
});

describe("WorkflowsService", () => {
  it("saves to a project and loads the definition back", async () => {
    await workflows.save(def(), { ownerId: OWNER, projectId: project.id });
    await expect(workflows.load(OWNER, "wf1")).resolves.toMatchObject({
      id: "wf1",
      start: "draft",
    });
  });

  it("lands a new workflow in Unfiled when no project is given", async () => {
    await workflows.save(def("wf2"), { ownerId: OWNER });
    const unfiled = await projectRepo.ensureUnfiled(OWNER);
    await expect(workflows.list(OWNER, unfiled.id)).resolves.toHaveLength(1);
  });

  it("validates the body through migrateWorkflow (invalid → throws)", async () => {
    await expect(
      workflows.save({ id: "bad", title: "x" }, { ownerId: OWNER, projectId: project.id }),
    ).rejects.toBeTruthy();
  });

  it("lists workflows by project and folder", async () => {
    folderRepo.seed(project.id, "fold1");
    await workflows.save(def("root"), { ownerId: OWNER, projectId: project.id });
    await workflows.save(def("infolder"), {
      ownerId: OWNER,
      projectId: project.id,
      folderId: "fold1",
    });
    await expect(workflows.list(OWNER, project.id)).resolves.toHaveLength(2);
    await expect(workflows.list(OWNER, project.id, "fold1")).resolves.toHaveLength(1);
    await expect(workflows.list(OWNER, project.id, null)).resolves.toHaveLength(1);
  });

  it("hides a workflow from a non-member (404, no existence leak)", async () => {
    await workflows.save(def(), { ownerId: OWNER, projectId: project.id });
    await expect(workflows.load("stranger", "wf1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lets a viewer read but not delete a workflow (403)", async () => {
    await workflows.save(def(), { ownerId: OWNER, projectId: project.id });
    await memberRepo.upsert({ projectId: project.id, userId: "viewer-u", role: "viewer" });
    await expect(workflows.load("viewer-u", "wf1")).resolves.toMatchObject({ id: "wf1" });
    await expect(workflows.remove("viewer-u", "wf1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("404s loading or deleting an unknown workflow id", async () => {
    await expect(workflows.load(OWNER, "ghost")).rejects.toBeInstanceOf(NotFoundException);
    await expect(workflows.remove(OWNER, "ghost")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("moves a workflow to a folder in its project, rejecting a foreign folder", async () => {
    folderRepo.seed(project.id, "fold1");
    const other = await projectRepo.create({ ownerId: OWNER, name: "Q", slug: "q" });
    folderRepo.seed(other.id, "otherFolder");
    await workflows.save(def(), { ownerId: OWNER, projectId: project.id });
    await expect(workflows.move(OWNER, "wf1", "fold1")).resolves.toMatchObject({
      folderId: "fold1",
    });
    await expect(workflows.move(OWNER, "wf1", "otherFolder")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
