import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { StatusCatalogEntry } from "@org/workflow-schema";
import { beforeEach, describe, expect, it } from "vitest";
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
  type StatusCatalogMeta,
  type StatusCatalogProjectScope,
  StatusCatalogRepo,
} from "../../persistence/repositories/status-catalog.repo.js";
import { FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { ProjectsService } from "../projects/projects.service.js";
import { StatusCatalogService } from "./status-catalog.service.js";

let seq = 0;

/** In-memory StatusCatalogRepo mirroring the Prisma scope-union/ownership rules. */
class FakeStatusCatalogRepo extends StatusCatalogRepo {
  readonly rows = new Map<string, StatusCatalogEntry & { ownerId: string }>();

  async list(userId: string, project?: StatusCatalogProjectScope): Promise<StatusCatalogEntry[]> {
    return [...this.rows.values()]
      .filter((r) =>
        project
          ? (r.ownerId === userId && r.scope === "global") ||
            (r.ownerId === project.ownerId && r.scope === "project" && r.projectId === project.id)
          : r.ownerId === userId && r.scope === "global",
      )
      .map(({ ownerId: _o, ...e }) => e);
  }

  async findMeta(code: string): Promise<StatusCatalogMeta | null> {
    const row = this.rows.get(code);
    return row
      ? { ownerId: row.ownerId, scope: row.scope ?? "global", projectId: row.projectId ?? null }
      : null;
  }

  async upsert(ownerId: string, entry: StatusCatalogEntry): Promise<StatusCatalogEntry> {
    const scope = entry.scope ?? "global";
    const normalized: StatusCatalogEntry = {
      ...entry,
      scope,
      ...(scope === "project" ? { projectId: entry.projectId } : { projectId: undefined }),
    };
    this.rows.set(entry.code, { ...normalized, ownerId });
    return normalized;
  }

  async remove(ownerId: string, code: string): Promise<boolean> {
    const row = this.rows.get(code);
    if (!row || row.ownerId !== ownerId) return false;
    this.rows.delete(code);
    return true;
  }

  async promote(ownerId: string, code: string): Promise<StatusCatalogEntry | null> {
    const row = this.rows.get(code);
    if (!row || row.ownerId !== ownerId) return null;
    row.scope = "global";
    row.projectId = undefined;
    const { ownerId: _o, ...e } = row;
    return e;
  }
}

/** Minimal project store so requireAccess can resolve owner/role. */
class FakeProjectRepo extends ProjectRepo {
  readonly rows = new Map<string, ProjectRecord>();
  async ensureUnfiled(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async create(input: ProjectCreateInput): Promise<ProjectRecord> {
    const now = new Date();
    const row: ProjectRecord = {
      id: `proj_${++seq}`,
      ownerId: input.ownerId,
      tenantId: input.tenantId ?? FakeTenantRepo.tenantIdFor(input.ownerId),
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

class UnusedFolderRepo extends FolderRepo {
  async create(): Promise<never> {
    throw new Error("not used");
  }
  async list(): Promise<never> {
    throw new Error("not used");
  }
  async findById(): Promise<never> {
    throw new Error("not used");
  }
  async update(): Promise<never> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
  async countChildren(): Promise<never> {
    throw new Error("not used");
  }
}
class UnusedFormRepo extends FormRepo {
  async upsert(): Promise<never> {
    throw new Error("not used");
  }
  async load(): Promise<never> {
    throw new Error("not used");
  }
  async findSummary(): Promise<never> {
    throw new Error("not used");
  }
  async listSummaries(): Promise<never> {
    throw new Error("not used");
  }
  async move(): Promise<never> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
}

const OWNER = "owner-a";
const base = (over: Partial<StatusCatalogEntry>): StatusCatalogEntry => ({
  code: "pending",
  label: "Chờ duyệt",
  kind: "normal",
  ...over,
});

let repo: FakeStatusCatalogRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let projects: ProjectsService;
let catalog: StatusCatalogService;
let projA: ProjectRecord;
let projB: ProjectRecord;

beforeEach(async () => {
  seq = 0;
  repo = new FakeStatusCatalogRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  projects = new ProjectsService(
    projectRepo,
    new UnusedFolderRepo(),
    new UnusedFormRepo(),
    memberRepo,
    new FakeTenantRepo(),
    new FakeRbacRepo(),
  );
  catalog = new StatusCatalogService(repo, projects);
  projA = await projectRepo.create({ ownerId: OWNER, name: "A", slug: "a" });
  projB = await projectRepo.create({ ownerId: OWNER, name: "B", slug: "b" });
});

describe("StatusCatalogService", () => {
  it("a project sees global ∪ its own statuses, not other projects'", async () => {
    await catalog.save(OWNER, base({ code: "g", scope: "global", label: "Global" }));
    await catalog.save(OWNER, base({ code: "a", scope: "project", projectId: projA.id }));
    await catalog.save(OWNER, base({ code: "b", scope: "project", projectId: projB.id }));

    const inA = await catalog.list(OWNER, projA.id);
    expect(inA.map((e) => e.code).sort()).toEqual(["a", "g"]);

    const globalOnly = await catalog.list(OWNER);
    expect(globalOnly.map((e) => e.code)).toEqual(["g"]);
  });

  it("rejects a project status without a projectId (validation)", async () => {
    await expect((async () => catalog.save(OWNER, base({ scope: "project" })))()).rejects.toThrow();
  });

  it("rejects an unknown kind (validation)", async () => {
    await expect(
      (async () => catalog.save(OWNER, { code: "x", label: "X", kind: "optional" }))(),
    ).rejects.toThrow();
  });

  it("does not leak statuses across owners", async () => {
    await catalog.save(OWNER, base({ code: "g", scope: "global" }));
    expect(await catalog.list("intruder")).toEqual([]);
  });

  it("rejects an upsert that would overwrite another owner's code (409)", async () => {
    await catalog.save(OWNER, base({ code: "shared", scope: "global", label: "Mine" }));
    await expect(
      catalog.save("intruder", base({ code: "shared", scope: "global", label: "Hijack" })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await catalog.list(OWNER))[0]?.label).toBe("Mine");
  });

  it("promote makes a project status visible everywhere", async () => {
    await catalog.save(OWNER, base({ code: "a", scope: "project", projectId: projA.id }));
    expect(await catalog.list(OWNER)).toEqual([]); // not global yet
    const promoted = await catalog.promote(OWNER, "a");
    expect(promoted.scope).toBe("global");
    expect(promoted.projectId).toBeUndefined();
    expect((await catalog.list(OWNER, projB.id)).map((e) => e.code)).toContain("a");
  });

  it("remove / promote a missing status → 404", async () => {
    await expect(catalog.remove(OWNER, "nope")).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.promote(OWNER, "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("StatusCatalogService sharing", () => {
  it("shows a collaborator the shared project catalog, stored under the project owner", async () => {
    await memberRepo.upsert({ projectId: projA.id, userId: "viewer-u", role: "viewer" });
    await catalog.save(OWNER, base({ code: "a", scope: "project", projectId: projA.id }));
    await catalog.save("viewer-u", base({ code: "vg", scope: "global", label: "Viewer global" }));

    const seen = await catalog.list("viewer-u", projA.id);
    expect(seen.map((e) => e.code).sort()).toEqual(["a", "vg"]);
  });

  it("lets an editor write the shared catalog; a viewer cannot (403)", async () => {
    await memberRepo.upsert({ projectId: projA.id, userId: "editor-u", role: "editor" });
    await memberRepo.upsert({ projectId: projA.id, userId: "viewer-u", role: "viewer" });

    const saved = await catalog.save(
      "editor-u",
      base({ code: "e", scope: "project", projectId: projA.id, label: "Editor" }),
    );
    expect(saved.label).toBe("Editor");
    expect((await catalog.list(OWNER, projA.id)).map((e) => e.code)).toContain("e");

    await expect(
      catalog.save("viewer-u", base({ code: "v", scope: "project", projectId: projA.id })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides a non-member's project catalog access (404, no existence leak)", async () => {
    await expect(catalog.list("stranger", projA.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      catalog.save("stranger", base({ code: "x", scope: "project", projectId: projA.id })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
