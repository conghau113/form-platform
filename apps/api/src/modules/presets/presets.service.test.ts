import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Preset } from "@org/form-schema";
import { beforeEach, describe, expect, it } from "vitest";
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import {
  type PresetMeta,
  type PresetProjectScope,
  PresetRepo,
} from "../../persistence/repositories/preset.repo.js";
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
import { FakeOrgUnitRepo, FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import { ProjectsService } from "../projects/projects.service.js";
import { PresetsService } from "./presets.service.js";

let seq = 0;

/** In-memory PresetRepo mirroring the Prisma scope-union/ownership rules (see PrismaPresetRepo). */
class FakePresetRepo extends PresetRepo {
  readonly rows = new Map<string, Preset & { ownerId: string }>();

  async list(userId: string, project?: PresetProjectScope): Promise<Preset[]> {
    return [...this.rows.values()]
      .filter((r) =>
        project
          ? (r.ownerId === userId && r.scope === "global") ||
            (r.ownerId === project.ownerId && r.scope === "project" && r.projectId === project.id)
          : r.ownerId === userId && r.scope === "global",
      )
      .map(({ ownerId: _o, ...p }) => p);
  }

  async findMeta(id: string): Promise<PresetMeta | null> {
    const row = this.rows.get(id);
    return row
      ? { ownerId: row.ownerId, scope: row.scope ?? "global", projectId: row.projectId ?? null }
      : null;
  }

  async upsert(ownerId: string, preset: Preset): Promise<Preset> {
    const scope = preset.scope ?? "global";
    const normalized: Preset = {
      ...preset,
      scope,
      ...(scope === "project" ? { projectId: preset.projectId } : { projectId: undefined }),
    };
    this.rows.set(preset.id, { ...normalized, ownerId });
    return normalized;
  }

  async remove(ownerId: string, id: string): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.ownerId !== ownerId) return false;
    this.rows.delete(id);
    return true;
  }

  async promote(ownerId: string, id: string): Promise<Preset | null> {
    const row = this.rows.get(id);
    if (!row || row.ownerId !== ownerId) return null;
    row.scope = "global";
    row.projectId = undefined;
    const { ownerId: _o, ...p } = row;
    return p;
  }
}

/** Minimal project store so requireAccess can resolve owner/role (folders/forms unused here). */
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

/** ProjectsService only touches the project + member repos in the paths presets exercise. */
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
const base = (over: Partial<Preset>): Preset => ({
  id: "p1",
  fieldType: "text",
  name: "Field",
  patch: {},
  ...over,
});

let repo: FakePresetRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let projects: ProjectsService;
let presets: PresetsService;
let projA: ProjectRecord;
let projB: ProjectRecord;

beforeEach(async () => {
  seq = 0;
  repo = new FakePresetRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  projects = new ProjectsService(
    projectRepo,
    new UnusedFolderRepo(),
    new UnusedFormRepo(),
    memberRepo,
    new FakeTenantRepo(),
    new FakeRbacRepo(),
    new FakeOrgUnitRepo(),
  );
  presets = new PresetsService(repo, projects);
  projA = await projectRepo.create({ ownerId: OWNER, name: "A", slug: "a" });
  projB = await projectRepo.create({ ownerId: OWNER, name: "B", slug: "b" });
});

describe("PresetsService", () => {
  it("a project sees global ∪ its own presets, not other projects'", async () => {
    await presets.save(OWNER, base({ id: "g", scope: "global", name: "Global" }));
    await presets.save(OWNER, base({ id: "a", scope: "project", projectId: projA.id, name: "A" }));
    await presets.save(OWNER, base({ id: "b", scope: "project", projectId: projB.id, name: "B" }));

    const inA = await presets.list(OWNER, projA.id);
    expect(inA.map((p) => p.id).sort()).toEqual(["a", "g"]);

    const globalOnly = await presets.list(OWNER);
    expect(globalOnly.map((p) => p.id)).toEqual(["g"]);
  });

  it("rejects a project preset without a projectId (validation)", async () => {
    // `parsePreset` throws synchronously inside `save`; wrap so it surfaces as a rejection.
    await expect((async () => presets.save(OWNER, base({ scope: "project" })))()).rejects.toThrow();
  });

  it("does not leak presets across owners", async () => {
    await presets.save(OWNER, base({ id: "g", scope: "global" }));
    expect(await presets.list("intruder")).toEqual([]);
  });

  it("rejects an upsert that would overwrite another owner's preset id (409)", async () => {
    await presets.save(OWNER, base({ id: "shared", scope: "global", name: "Mine" }));
    await expect(
      presets.save("intruder", base({ id: "shared", scope: "global", name: "Hijack" })),
    ).rejects.toBeInstanceOf(ConflictException);
    // Owner A's preset is untouched.
    expect((await presets.list(OWNER))[0]?.name).toBe("Mine");
  });

  it("promote makes a project preset visible everywhere", async () => {
    await presets.save(OWNER, base({ id: "a", scope: "project", projectId: projA.id }));
    expect(await presets.list(OWNER)).toEqual([]); // not global yet
    const promoted = await presets.promote(OWNER, "a");
    expect(promoted.scope).toBe("global");
    expect(promoted.projectId).toBeUndefined();
    expect((await presets.list(OWNER, projB.id)).map((p) => p.id)).toContain("a");
  });

  it("remove / promote a missing preset → 404", async () => {
    await expect(presets.remove(OWNER, "nope")).rejects.toBeInstanceOf(NotFoundException);
    await expect(presets.promote(OWNER, "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("PresetsService sharing (W5 follow-up)", () => {
  it("shows a collaborator the shared project library, stored under the project owner", async () => {
    await memberRepo.upsert({ projectId: projA.id, userId: "viewer-u", role: "viewer" });
    await presets.save(OWNER, base({ id: "a", scope: "project", projectId: projA.id, name: "A" }));
    await presets.save("viewer-u", base({ id: "vg", scope: "global", name: "Viewer global" }));

    const seen = await presets.list("viewer-u", projA.id);
    // The project preset (owned by OWNER) is visible, alongside the viewer's own global.
    expect(seen.map((p) => p.id).sort()).toEqual(["a", "vg"]);
  });

  it("lets an editor write the shared library; a viewer cannot (403)", async () => {
    await memberRepo.upsert({ projectId: projA.id, userId: "editor-u", role: "editor" });
    await memberRepo.upsert({ projectId: projA.id, userId: "viewer-u", role: "viewer" });

    const saved = await presets.save(
      "editor-u",
      base({ id: "e", scope: "project", projectId: projA.id, name: "Editor" }),
    );
    expect(saved.name).toBe("Editor");
    // Stored under the project owner → the owner sees it too.
    expect((await presets.list(OWNER, projA.id)).map((p) => p.id)).toContain("e");

    await expect(
      presets.save("viewer-u", base({ id: "v", scope: "project", projectId: projA.id })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides a non-member's project preset access (404, no existence leak)", async () => {
    await expect(presets.list("stranger", projA.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      presets.save("stranger", base({ id: "x", scope: "project", projectId: projA.id })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
