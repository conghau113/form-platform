import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import {
  CURRENT_FORM_VERSION,
  type FormSchema,
  type FormVersion,
  migrate,
  type Submission,
} from "@org/form-schema";
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
import {
  type SubmissionMeta,
  SubmissionRepo,
  type SubmissionSummary,
} from "../../persistence/repositories/submission.repo.js";
import { ProjectsService } from "../projects/projects.service.js";
import { SubmissionsService } from "./submissions.service.js";

let seq = 0;

/** A form with one required text field — enough to exercise blocking validation + stripping. */
function form(id = "contact"): FormSchema {
  return migrate({
    formVersion: CURRENT_FORM_VERSION,
    id,
    title: "Contact",
    fields: [{ type: "text", name: "email", label: "Email", required: true }],
  });
}

/** A form with an `hr`-gated field, for FS2 field-level RBAC on submit/read. */
function rbacForm(id = "hrform"): FormSchema {
  return migrate({
    formVersion: CURRENT_FORM_VERSION,
    id,
    title: "HR",
    fields: [
      { type: "text", name: "email", label: "Email", required: true },
      { type: "text", name: "salary", label: "Salary", permissions: { viewRoles: ["hr"] } },
    ],
  });
}

class FakeSubmissionRepo extends SubmissionRepo {
  readonly bodies = new Map<string, Submission>();
  readonly meta = new Map<string, SubmissionMeta>();
  readonly at = new Map<string, Date>();
  async create(submission: Submission, meta: SubmissionMeta) {
    this.bodies.set(submission.id, submission);
    this.meta.set(submission.id, meta);
    this.at.set(submission.id, new Date());
    return submission;
  }
  async load(id: string) {
    return this.bodies.get(id) ?? null;
  }
  async findSummary(id: string): Promise<SubmissionSummary | null> {
    const s = this.bodies.get(id);
    const m = this.meta.get(id);
    if (!s || !m) return null;
    return {
      id,
      formId: m.formId,
      projectId: m.projectId,
      submittedBy: s.submittedBy,
      submittedAt: this.at.get(id) ?? new Date(),
    };
  }
  async listByForm(formId: string): Promise<SubmissionSummary[]> {
    const out: SubmissionSummary[] = [];
    for (const id of this.bodies.keys()) {
      const m = this.meta.get(id);
      if (m?.formId !== formId) continue;
      const s = await this.findSummary(id);
      if (s) out.push(s);
    }
    return out;
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

/** In-memory FormVersionRepo. Empty ⇒ `loadActive` returns null ⇒ submissions fall back to the
 *  draft (FS1 behavior). `publish` mirrors the prisma impl: assign next sequence, set active. */
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
      projectId: "",
      version: v.version,
      formVersion: v.formVersion,
      publishedBy: v.publishedBy,
      publishedAt: new Date(v.publishedAt),
    }));
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
let submissionRepo: FakeSubmissionRepo;
let formRepo: FakeFormRepo;
let versionRepo: FakeFormVersionRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let service: SubmissionsService;
let project: ProjectRecord;

async function seedForm(f = form()): Promise<void> {
  await formRepo.upsert(f, { projectId: project.id });
}

beforeEach(async () => {
  seq = 0;
  submissionRepo = new FakeSubmissionRepo();
  formRepo = new FakeFormRepo();
  versionRepo = new FakeFormVersionRepo();
  projectRepo = new FakeProjectRepo();
  memberRepo = new FakeProjectMemberRepo();
  const projects = new ProjectsService(projectRepo, new FakeFolderRepo(), formRepo, memberRepo);
  service = new SubmissionsService(submissionRepo, formRepo, versionRepo, projects);
  project = await projectRepo.create({ ownerId: OWNER, name: "P", slug: "p" });
});

describe("SubmissionsService", () => {
  it("records a valid submission, stripping unknown fields and pinning the snapshot", async () => {
    await seedForm();
    const sub = await service.submit(OWNER, "contact", {
      data: { email: "a@b.com", secret: "leak" },
    });
    expect(sub.submittedBy).toBe(OWNER);
    expect(sub.formVersion).toBe(CURRENT_FORM_VERSION);
    expect(sub.schemaSnapshot.fields).toHaveLength(1);
    // The stored answer is the validated output — the unknown `secret` key is stripped.
    expect(sub.data).toEqual({ email: "a@b.com" });
    await expect(service.load(OWNER, sub.id)).resolves.toMatchObject({
      data: { email: "a@b.com" },
    });
  });

  it("rejects a submission that fails validation (422) and stores nothing", async () => {
    await seedForm();
    await expect(service.submit(OWNER, "contact", { data: {} })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(service.list(OWNER, "contact")).resolves.toHaveLength(0);
  });

  it("pins the snapshot so a later form edit doesn't change an old submission", async () => {
    await seedForm();
    const sub = await service.submit(OWNER, "contact", { data: { email: "a@b.com" } });
    // Edit the form: add a second field.
    await formRepo.upsert(
      migrate({
        formVersion: CURRENT_FORM_VERSION,
        id: "contact",
        title: "Contact",
        fields: [
          { type: "text", name: "email", label: "Email", required: true },
          { type: "text", name: "phone", label: "Phone" },
        ],
      }),
      { projectId: project.id },
    );
    const loaded = await service.load(OWNER, sub.id);
    expect(loaded.schemaSnapshot.fields).toHaveLength(1); // still the form as it was at submit time
  });

  it("lists a form's submissions, hiding them from a non-member (404)", async () => {
    await seedForm();
    await service.submit(OWNER, "contact", { data: { email: "a@b.com" } });
    await service.submit(OWNER, "contact", { data: { email: "c@d.com" } });
    await expect(service.list(OWNER, "contact")).resolves.toHaveLength(2);
    await expect(service.list("stranger", "contact")).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.submit("stranger", "contact", { data: { email: "x@y.com" } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lets a project viewer submit (FS1 gate is viewer; FS2 refines)", async () => {
    await seedForm();
    await memberRepo.upsert({ projectId: project.id, userId: "viewer-u", role: "viewer" });
    const sub = await service.submit("viewer-u", "contact", { data: { email: "v@w.com" } });
    expect(sub.submittedBy).toBe("viewer-u");
  });

  it("strips a role-gated field on submit when the submitter lacks the role (FS2)", async () => {
    await formRepo.upsert(rbacForm(), { projectId: project.id });
    // OWNER holds only the project `owner` role, not `hr` → `salary` is excluded server-side.
    const sub = await service.submit(OWNER, "hrform", {
      data: { email: "a@b.com", salary: "999" },
    });
    expect(sub.data).toEqual({ email: "a@b.com" });
  });

  it("keeps a role-gated field on submit when the submitter declares the role (FS2)", async () => {
    await formRepo.upsert(rbacForm(), { projectId: project.id });
    const sub = await service.submit(OWNER, "hrform", {
      data: { email: "a@b.com", salary: "999" },
      roles: ["hr"],
    });
    expect(sub.data).toEqual({ email: "a@b.com", salary: "999" });
  });

  it("masks a role-gated field on read unless the reader declares the role (FS2)", async () => {
    await formRepo.upsert(rbacForm(), { projectId: project.id });
    const sub = await service.submit(OWNER, "hrform", {
      data: { email: "a@b.com", salary: "999" },
      roles: ["hr"],
    });
    // Stored with salary, but a reader without `hr` sees it masked…
    await expect(service.load(OWNER, sub.id)).resolves.toMatchObject({
      data: { email: "a@b.com" },
    });
    expect((await service.load(OWNER, sub.id)).data).not.toHaveProperty("salary");
    // …and a reader who declares `hr` sees it.
    await expect(service.load(OWNER, sub.id, ["hr"])).resolves.toMatchObject({
      data: { email: "a@b.com", salary: "999" },
    });
  });

  it("validates against the current draft when the form was never published (FB1 fallback)", async () => {
    await seedForm();
    // No published version → loadActive returns null → the draft is the pinned snapshot.
    const sub = await service.submit(OWNER, "contact", { data: { email: "a@b.com" } });
    expect(sub.schemaSnapshot.fields).toHaveLength(1);
  });

  it("pins the active published version even after the draft changes (FB1)", async () => {
    await seedForm();
    // Publish v1 (one field), then edit the draft to add a second field.
    await versionRepo.publish({
      id: "ver-1",
      formId: "contact",
      projectId: project.id,
      body: form(),
      publishedBy: OWNER,
      publishedAt: new Date(),
    });
    await formRepo.upsert(
      migrate({
        formVersion: CURRENT_FORM_VERSION,
        id: "contact",
        title: "Contact",
        fields: [
          { type: "text", name: "email", label: "Email", required: true },
          { type: "text", name: "phone", label: "Phone" },
        ],
      }),
      { projectId: project.id },
    );
    // A submission validates against published v1, not the 2-field draft → `phone` is stripped.
    const sub = await service.submit(OWNER, "contact", {
      data: { email: "a@b.com", phone: "123" },
    });
    expect(sub.schemaSnapshot.fields).toHaveLength(1);
    expect(sub.data).toEqual({ email: "a@b.com" });
  });

  it("404s submitting to an unknown form or loading an unknown submission", async () => {
    await expect(service.submit(OWNER, "ghost", { data: {} })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await seedForm();
    await expect(service.load(OWNER, "ghost-sub")).rejects.toBeInstanceOf(NotFoundException);
  });
});
