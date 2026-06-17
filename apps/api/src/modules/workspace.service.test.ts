import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
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
import {
  type MemberRole,
  type ProjectMemberRecord,
  ProjectMemberRepo,
} from "../persistence/repositories/project-member.repo.js";
import { FoldersService } from "./folders/folders.service.js";
import { MembersService } from "./projects/members.service.js";
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
  async findByIds(ids: string[]): Promise<ProjectRecord[]> {
    return ids.map((id) => this.rows.get(id)).filter((p): p is ProjectRecord => p != null);
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

class FakeProjectMemberRepo extends ProjectMemberRepo {
  readonly rows = new Map<string, ProjectMemberRecord>();
  private key(projectId: string, userId: string) {
    return `${projectId}:${userId}`;
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
let projectRepo: FakeProjectRepo;
let folderRepo: FakeFolderRepo;
let formRepo: FakeFormRepo;
let memberRepo: FakeProjectMemberRepo;
let projects: ProjectsService;
let folders: FoldersService;
let membersSvc: MembersService;

beforeEach(() => {
  seq = 0;
  projectRepo = new FakeProjectRepo();
  folderRepo = new FakeFolderRepo();
  formRepo = new FakeFormRepo();
  memberRepo = new FakeProjectMemberRepo();
  projects = new ProjectsService(projectRepo, folderRepo, formRepo, memberRepo);
  folders = new FoldersService(folderRepo, projects);
  membersSvc = new MembersService(projects, memberRepo);
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

describe("ProjectsService sharing (W5)", () => {
  it("resolves owner as the implicit owner role (no member row needed)", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await expect(projects.resolveRole(OWNER, p.id)).resolves.toBe("owner");
    await expect(projects.resolveRole("nobody", p.id)).resolves.toBeNull();
  });

  it("lets a viewer read but not write; an editor can write", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await memberRepo.upsert({ projectId: p.id, userId: "viewer-u", role: "viewer" });
    await memberRepo.upsert({ projectId: p.id, userId: "editor-u", role: "editor" });

    // viewer: read OK, write (create folder) → 403
    await expect(projects.getTree("viewer-u", p.id)).resolves.toMatchObject({
      project: { id: p.id },
    });
    await expect(folders.create("viewer-u", { projectId: p.id, name: "X" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // editor: write OK
    await expect(folders.create("editor-u", { projectId: p.id, name: "X" })).resolves.toMatchObject(
      {
        name: "X",
      },
    );
  });

  it("keeps project rename/delete owner-only (editor → 403)", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await memberRepo.upsert({ projectId: p.id, userId: "editor-u", role: "editor" });
    await expect(projects.update("editor-u", p.id, { name: "Nope" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(projects.remove("editor-u", p.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides a project from a complete non-member (404, no existence leak)", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await expect(projects.getOne("stranger", p.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists owned ∪ shared projects, most-recent first, de-duplicated", async () => {
    const owned = await projects.create(OWNER, { name: "Owned" });
    const shared = await projects.create("other-owner", { name: "Shared" });
    await memberRepo.upsert({ projectId: shared.id, userId: OWNER, role: "viewer" });

    const list = await projects.list(OWNER);
    const ids = list.map((p) => p.id);
    expect(ids).toContain(owned.id);
    expect(ids).toContain(shared.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("MembersService (W5)", () => {
  it("lets the owner grant, change, and revoke a collaborator", async () => {
    const p = await projects.create(OWNER, { name: "P" });

    const granted = await membersSvc.grant(OWNER, p.id, "bob", "viewer");
    expect(granted).toMatchObject({ userId: "bob", role: "viewer" });

    const view = await membersSvc.list(OWNER, p.id);
    expect(view.ownerId).toBe(OWNER);
    expect(view.members).toHaveLength(1);

    const updated = await membersSvc.updateRole(OWNER, p.id, "bob", "editor");
    expect(updated.role).toBe("editor");

    await membersSvc.revoke(OWNER, p.id, "bob");
    expect((await membersSvc.list(OWNER, p.id)).members).toHaveLength(0);
  });

  it("rejects an invalid role and sharing with the owner (400)", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await expect(membersSvc.grant(OWNER, p.id, "bob", "admin")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(membersSvc.grant(OWNER, p.id, OWNER, "editor")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("forbids a non-owner from managing members (editor → 403, viewer roster read OK)", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await membersSvc.grant(OWNER, p.id, "ed", "editor");
    await expect(membersSvc.grant("ed", p.id, "carol", "viewer")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // but an editor (viewer+) may read the roster
    await expect(membersSvc.list("ed", p.id)).resolves.toMatchObject({ ownerId: OWNER });
  });

  it("404s when changing/revoking a non-member", async () => {
    const p = await projects.create(OWNER, { name: "P" });
    await expect(membersSvc.updateRole(OWNER, p.id, "ghost", "viewer")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(membersSvc.revoke(OWNER, p.id, "ghost")).rejects.toBeInstanceOf(NotFoundException);
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
