import { ConflictException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type FolderChildCounts,
  type FolderCreateInput,
  type FolderRecord,
  FolderRepo,
  type FolderUpdateInput,
} from "../persistence/repositories/folder.repo.js";
import {
  type FormListQuery,
  FormRepo,
  type FormSummary,
  type FormUpsertMeta,
} from "../persistence/repositories/form.repo.js";
import {
  type ProjectCreateInput,
  type ProjectRecord,
  ProjectRepo,
  type ProjectUpdateInput,
} from "../persistence/repositories/project.repo.js";
import { FoldersService } from "./folders/folders.service.js";
import { ProjectsService } from "./projects/projects.service.js";

let seq = 0;
const nextId = (p: string) => `${p}_${++seq}`;

class FakeProjectRepo extends ProjectRepo {
  readonly rows = new Map<string, ProjectRecord>();
  async ensureUnfiled(ownerId: string): Promise<ProjectRecord> {
    for (const p of this.rows.values()) {
      if (p.ownerId === ownerId && p.slug === "unfiled") return p;
    }
    return this.create({ ownerId, name: "Unfiled", slug: "unfiled" });
  }
  async create(input: ProjectCreateInput): Promise<ProjectRecord> {
    const now = new Date();
    const row: ProjectRecord = {
      id: nextId("proj"),
      ownerId: input.ownerId,
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
  async update(id: string, patch: ProjectUpdateInput): Promise<ProjectRecord> {
    const row = this.rows.get(id);
    if (!row) throw new Error("missing");
    Object.assign(row, patch, { updatedAt: new Date() });
    return row;
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

class FakeFolderRepo extends FolderRepo {
  readonly rows = new Map<string, FolderRecord>();
  async create(input: FolderCreateInput): Promise<FolderRecord> {
    const row: FolderRecord = {
      id: nextId("fold"),
      projectId: input.projectId,
      parentId: input.parentId ?? null,
      name: input.name,
      order: input.order ?? 0,
      createdAt: new Date(),
    };
    this.rows.set(row.id, row);
    return row;
  }
  async list(projectId: string): Promise<FolderRecord[]> {
    return [...this.rows.values()].filter((f) => f.projectId === projectId);
  }
  async findById(id: string): Promise<FolderRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async update(id: string, patch: FolderUpdateInput): Promise<FolderRecord> {
    const row = this.rows.get(id);
    if (!row) throw new Error("missing");
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.order !== undefined) row.order = patch.order;
    if ("parentId" in patch) row.parentId = patch.parentId ?? null;
    return row;
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
  async countChildren(folderId: string): Promise<FolderChildCounts> {
    const folders = [...this.rows.values()].filter((f) => f.parentId === folderId).length;
    return { folders, forms: 0 };
  }
}

class FakeFormRepo extends FormRepo {
  readonly summaries = new Map<string, FormSummary>();
  async upsert(): Promise<never> {
    throw new Error("not used");
  }
  async load() {
    return null;
  }
  async findSummary(id: string): Promise<FormSummary | null> {
    return this.summaries.get(id) ?? null;
  }
  async listSummaries(query: FormListQuery): Promise<FormSummary[]> {
    return [...this.summaries.values()].filter((s) => s.projectId === query.projectId);
  }
  async move(): Promise<FormSummary | null> {
    return null;
  }
  async delete(): Promise<void> {}
  // test helper
  seed(meta: FormUpsertMeta & { id: string; title: string }): void {
    this.summaries.set(meta.id, {
      id: meta.id,
      projectId: meta.projectId,
      folderId: meta.folderId ?? null,
      title: meta.title,
      status: null,
      updatedAt: new Date(),
    });
  }
}

const OWNER = "owner-a";
let projectRepo: FakeProjectRepo;
let folderRepo: FakeFolderRepo;
let formRepo: FakeFormRepo;
let projects: ProjectsService;
let folders: FoldersService;

beforeEach(() => {
  seq = 0;
  projectRepo = new FakeProjectRepo();
  folderRepo = new FakeFolderRepo();
  formRepo = new FakeFormRepo();
  projects = new ProjectsService(projectRepo, folderRepo, formRepo);
  folders = new FoldersService(folderRepo, projects);
});

describe("ProjectsService", () => {
  it("derives a unique slug per owner", async () => {
    const a = await projects.create(OWNER, { name: "HR Platform" });
    const b = await projects.create(OWNER, { name: "HR Platform" });
    expect(a.slug).toBe("hr-platform");
    expect(b.slug).toBe("hr-platform-2");
  });

  it("hides projects owned by someone else (404, no existence leak)", async () => {
    const p = await projects.create(OWNER, { name: "Secret" });
    await expect(projects.getOne("intruder", p.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(projects.getOne(OWNER, p.id)).resolves.toMatchObject({ id: p.id });
  });

  it("builds a tree of folders + form summaries", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await folders.create(OWNER, { projectId: p.id, name: "Onboarding" });
    formRepo.seed({ id: "f1", projectId: p.id, title: "Form 1" });
    const tree = await projects.getTree(OWNER, p.id);
    expect(tree.project.id).toBe(p.id);
    expect(tree.folders).toHaveLength(1);
    expect(tree.forms).toHaveLength(1);
  });
});

describe("FoldersService", () => {
  it("rejects a move that would create a cycle (409)", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    const a = await folders.create(OWNER, { projectId: p.id, name: "A" });
    const b = await folders.create(OWNER, { projectId: p.id, parentId: a.id, name: "B" });
    // Move A under its own child B → cycle.
    await expect(folders.update(OWNER, a.id, { parentId: b.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Move B to root → fine.
    await expect(folders.update(OWNER, b.id, { parentId: null })).resolves.toMatchObject({
      parentId: null,
    });
  });

  it("blocks deleting a non-empty folder unless cascade", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    const a = await folders.create(OWNER, { projectId: p.id, name: "A" });
    await folders.create(OWNER, { projectId: p.id, parentId: a.id, name: "B" });
    await expect(folders.remove(OWNER, a.id, false)).rejects.toBeInstanceOf(ConflictException);
    await expect(folders.remove(OWNER, a.id, true)).resolves.toBeUndefined();
    expect(folderRepo.rows.has(a.id)).toBe(false);
  });

  it("enforces ownership through the project gate", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    const a = await folders.create(OWNER, { projectId: p.id, name: "A" });
    await expect(folders.remove("intruder", a.id, false)).rejects.toBeInstanceOf(NotFoundException);
  });
});
