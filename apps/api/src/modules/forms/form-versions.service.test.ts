import { NotFoundException } from "@nestjs/common";
import { CURRENT_FORM_VERSION, type FormSchema, type FormVersion, migrate } from "@org/form-schema";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  FolderChildCounts,
  FolderRecord,
} from "../../persistence/repositories/folder.repo.js";
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import {
  type FormListQuery,
  FormRepo,
  type FormSummary,
  type FormUpsertMeta,
} from "../../persistence/repositories/form.repo.js";
import {
  FormVersionRepo,
  type FormVersionSummary,
  type PublishInput,
} from "../../persistence/repositories/form-version.repo.js";
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
import { ProjectsService } from "../projects/projects.service.js";
import { FormVersionsService } from "./form-versions.service.js";

let seq = 0;

function form(id = "contact", label = "Email"): FormSchema {
  return migrate({
    formVersion: CURRENT_FORM_VERSION,
    id,
    title: "Contact",
    fields: [{ type: "text", name: "email", label, required: true }],
  });
}

class FakeFormVersionRepo extends FormVersionRepo {
  readonly byForm = new Map<string, FormVersion[]>();
  readonly active = new Map<string, number>();
  async publish(input: PublishInput): Promise<FormVersion> {
    const list = this.byForm.get(input.formId) ?? [];
    const version = (list.at(-1)?.version ?? 0) + 1;
    const v: FormVersion = {
      id: input.id,
      formId: input.formId,
      version,
      formVersion: input.body.formVersion,
      body: input.body,
      publishedBy: input.publishedBy,
      publishedAt: input.publishedAt.toISOString(),
    };
    list.push(v);
    this.byForm.set(input.formId, list);
    this.active.set(input.formId, version);
    return v;
  }
  async loadActive(formId: string): Promise<FormVersion | null> {
    const a = this.active.get(formId);
    return a == null ? null : this.load(formId, a);
  }
  async load(formId: string, version: number): Promise<FormVersion | null> {
    return this.byForm.get(formId)?.find((v) => v.version === version) ?? null;
  }
  async listByForm(formId: string): Promise<FormVersionSummary[]> {
    return [...(this.byForm.get(formId) ?? [])].reverse().map((v) => ({
      id: v.id,
      formId: v.formId,
      projectId: "p",
      version: v.version,
      formVersion: v.formVersion,
      publishedBy: v.publishedBy,
      publishedAt: new Date(v.publishedAt),
    }));
  }
}

class FakeFormRepo extends FormRepo {
  readonly bodies = new Map<string, FormSchema>();
  readonly summaries = new Map<string, FormSummary>();
  async upsert(f: FormSchema, meta: FormUpsertMeta): Promise<FormSchema> {
    this.bodies.set(f.id, f);
    this.summaries.set(f.id, {
      id: f.id,
      projectId: meta.projectId,
      folderId: meta.folderId ?? null,
      title: f.title,
      status: null,
      updatedAt: new Date(),
    });
    return f;
  }
  async load(id: string): Promise<FormSchema | null> {
    return this.bodies.get(id) ?? null;
  }
  async findSummary(id: string): Promise<FormSummary | null> {
    return this.summaries.get(id) ?? null;
  }
  async listSummaries(query: FormListQuery): Promise<FormSummary[]> {
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
let formRepo: FakeFormRepo;
let versionRepo: FakeFormVersionRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let service: FormVersionsService;
let project: ProjectRecord;

/** Seed a form (optionally in a folder) so placement is exercised by clone-draft. */
async function seedForm(f = form(), folderId: string | null = null): Promise<void> {
  await formRepo.upsert(f, { projectId: project.id, folderId });
}

beforeEach(async () => {
  seq = 0;
  formRepo = new FakeFormRepo();
  versionRepo = new FakeFormVersionRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  const projects = new ProjectsService(projectRepo, new FakeFolderRepo(), formRepo, memberRepo);
  service = new FormVersionsService(versionRepo, formRepo, projects);
  project = await projectRepo.create({ ownerId: OWNER, name: "P", slug: "p" });
});

describe("FormVersionsService", () => {
  it("publishes the draft as an incrementing, immutable version", async () => {
    await seedForm();
    const v1 = await service.publish(OWNER, "contact");
    expect(v1.version).toBe(1);
    expect(v1.formVersion).toBe(CURRENT_FORM_VERSION);
    const v2 = await service.publish(OWNER, "contact");
    expect(v2.version).toBe(2);
  });

  it("lists versions newest-first and loads a version's frozen body", async () => {
    await seedForm();
    await service.publish(OWNER, "contact");
    await service.publish(OWNER, "contact");
    const list = await service.listVersions(OWNER, "contact");
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    const got = await service.getVersion(OWNER, "contact", 1);
    expect(got.body.fields).toHaveLength(1);
  });

  it("404s loading a version that does not exist", async () => {
    await seedForm();
    await expect(service.getVersion(OWNER, "contact", 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns null for the active version of a never-published form (not a 404)", async () => {
    await seedForm();
    await expect(service.loadActiveVersion(OWNER, "contact")).resolves.toBeNull();
  });

  it("returns the active published version after publishing", async () => {
    await seedForm();
    await service.publish(OWNER, "contact");
    await service.publish(OWNER, "contact"); // active follows the latest publish
    const active = await service.loadActiveVersion(OWNER, "contact");
    expect(active?.version).toBe(2);
    expect(active?.body.fields).toHaveLength(1);
  });

  it("clones a past version back into the draft, keeping the form's placement", async () => {
    await seedForm(form(), "folder-x");
    await service.publish(OWNER, "contact"); // v1 = label "Email"
    // Edit the draft (re-label), then roll back to v1.
    await formRepo.upsert(form("contact", "Email address"), {
      projectId: project.id,
      folderId: "folder-x",
    });
    const draft = await service.cloneDraft(OWNER, "contact", 1);
    const field = draft.fields[0];
    expect("label" in field && field.label).toBe("Email"); // draft now mirrors v1
    expect((await formRepo.findSummary("contact"))?.folderId).toBe("folder-x"); // placement kept
  });

  it("gates reads on viewer and writes on editor", async () => {
    await seedForm();
    await service.publish(OWNER, "contact");
    await memberRepo.upsert({ projectId: project.id, userId: "viewer-u", role: "viewer" });
    // A viewer can read history…
    await expect(service.listVersions("viewer-u", "contact")).resolves.toHaveLength(1);
    // …but cannot publish (editor) — a viewer is below the write gate (403).
    await expect(service.publish("viewer-u", "contact")).rejects.toThrow();
    // A non-member sees nothing (404).
    await expect(service.listVersions("stranger", "contact")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
