import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DEFAULT_TOKENS, type DesignTokens } from "@org/form-theme";
import { beforeEach, describe, expect, it } from "vitest";
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import {
  FormRepo,
  type FormSummary,
  type FormUpsertMeta,
} from "../../persistence/repositories/form.repo.js";
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
import { ThemeRepo } from "../../persistence/repositories/theme.repo.js";
import { ProjectsService } from "../projects/projects.service.js";
import { ThemesService } from "./themes.service.js";

let seq = 0;

class FakeThemeRepo extends ThemeRepo {
  readonly rows = new Map<string, DesignTokens>();
  async load(formId: string): Promise<DesignTokens | null> {
    return this.rows.get(formId) ?? null;
  }
  async upsert(formId: string, tokens: DesignTokens): Promise<DesignTokens> {
    this.rows.set(formId, tokens);
    return tokens;
  }
}

class FakeFormRepo extends FormRepo {
  readonly summaries = new Map<string, FormSummary>();
  async upsert(): Promise<never> {
    throw new Error("not used");
  }
  async load(): Promise<null> {
    return null;
  }
  async findSummary(id: string): Promise<FormSummary | null> {
    return this.summaries.get(id) ?? null;
  }
  async listSummaries(): Promise<FormSummary[]> {
    return [];
  }
  async move(): Promise<null> {
    return null;
  }
  async delete(): Promise<void> {}
  seed(meta: FormUpsertMeta & { id: string }): void {
    this.summaries.set(meta.id, {
      id: meta.id,
      projectId: meta.projectId,
      folderId: meta.folderId ?? null,
      title: meta.id,
      status: null,
      updatedAt: new Date(),
    });
  }
}

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
  async update(): Promise<ProjectRecord> {
    throw new Error("not used");
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

const OWNER = "owner-a";
let themeRepo: FakeThemeRepo;
let formRepo: FakeFormRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let themes: ThemesService;
let project: ProjectRecord;

beforeEach(async () => {
  seq = 0;
  themeRepo = new FakeThemeRepo();
  formRepo = new FakeFormRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  const projects = new ProjectsService(projectRepo, new UnusedFolderRepo(), formRepo, memberRepo);
  themes = new ThemesService(themeRepo, formRepo, projects);
  project = await projectRepo.create({ ownerId: OWNER, name: "P", slug: "p" });
  formRepo.seed({ id: "form1", projectId: project.id });
});

describe("ThemesService access (W5 follow-up)", () => {
  it("lets the owner save and load a form's theme", async () => {
    await themes.save(OWNER, "form1", DEFAULT_TOKENS);
    await expect(themes.load(OWNER, "form1")).resolves.toMatchObject({});
  });

  it("404s a theme for an unknown form id (no orphan themes)", async () => {
    await expect(themes.save(OWNER, "ghost", DEFAULT_TOKENS)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(themes.load(OWNER, "ghost")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("hides a form's theme from a non-member (404, no existence leak)", async () => {
    await themes.save(OWNER, "form1", DEFAULT_TOKENS);
    await expect(themes.load("stranger", "form1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(themes.save("stranger", "form1", DEFAULT_TOKENS)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("lets a viewer read but not write a form's theme (403)", async () => {
    await themes.save(OWNER, "form1", DEFAULT_TOKENS);
    await memberRepo.upsert({ projectId: project.id, userId: "viewer-u", role: "viewer" });
    await expect(themes.load("viewer-u", "form1")).resolves.toMatchObject({});
    await expect(themes.save("viewer-u", "form1", DEFAULT_TOKENS)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("404s loading a form that has no saved theme yet", async () => {
    await expect(themes.load(OWNER, "form1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
