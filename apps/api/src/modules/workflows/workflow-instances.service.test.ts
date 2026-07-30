import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { CURRENT_FORM_VERSION, type FormSchema } from "@org/form-schema";
import type { WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "../../persistence/repositories/audit.repo.js";
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
import type { CaseCommentRecord } from "../../persistence/repositories/case-comment.repo.js";
import { CaseCommentRepo } from "../../persistence/repositories/case-comment.repo.js";
import type {
  FolderChildCounts,
  FolderRecord,
} from "../../persistence/repositories/folder.repo.js";
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import { FormVersionRepo } from "../../persistence/repositories/form-version.repo.js";
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
import type { UserRecord } from "../../persistence/repositories/user.repo.js";
import { UserRepo } from "../../persistence/repositories/user.repo.js";
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
import { FakeOrgUnitRepo, FakeRbacRepo, FakeTenantRepo } from "../../testing/fake-tenant-rbac.js";
import type { MailService } from "../mail/mail.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { CaseCommentsService } from "./case-comments.service.js";
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
  async listByProjects(projectIds: string[]): Promise<WorkflowSummary[]> {
    return [...this.summaries.values()].filter((s) => projectIds.includes(s.projectId));
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
  /** Kept OUTSIDE `meta` on purpose — mirrors production, where `upsert` never writes it. */
  readonly assignees = new Map<string, string | null>();
  /** Same deal for the Phase E2 work-order attributes: `upsert` must never touch them. */
  readonly workOrder = new Map<string, { dueAt: Date | null; priority: number }>();
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
      label: meta.label,
      assigneeId: this.assignees.get(id) ?? null,
      statusLabel: meta.statusLabel,
      statusKind: meta.statusKind,
      dueAt: this.workOrder.get(id)?.dueAt ?? null,
      priority: this.workOrder.get(id)?.priority ?? 2,
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
  async listByProjects(): Promise<{ rows: never[]; total: number }> {
    throw new Error("not used — see work-orders.service.test.ts");
  }
  async setAssignee(id: string, assigneeId: string | null): Promise<void> {
    this.assignees.set(id, assigneeId);
  }
  async setWorkOrderFields(
    id: string,
    patch: { dueAt?: Date | null; priority?: number },
  ): Promise<void> {
    const current = this.workOrder.get(id) ?? { dueAt: null, priority: 2 };
    this.workOrder.set(id, {
      dueAt: patch.dueAt !== undefined ? patch.dueAt : current.dueAt,
      priority: patch.priority !== undefined ? patch.priority : current.priority,
    });
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

class FakeFormRepo extends FormRepo {
  readonly bodies = new Map<string, FormSchema>();
  async upsert(): Promise<never> {
    throw new Error("not used");
  }
  async load(id: string): Promise<FormSchema | null> {
    return this.bodies.get(id) ?? null;
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

/** Minimal collaborators for the Phase E additions (assign + masking) — none is exercised by the
 *  WF3 lifecycle tests, so they stay deliberately dumb. */
class FakeFormVersionRepo extends FormVersionRepo {
  async loadActive(): Promise<null> {
    return null;
  }
  async listByForm(): Promise<never[]> {
    return [];
  }
  async publish(): Promise<never> {
    throw new Error("not used");
  }
  async load(): Promise<null> {
    return null;
  }
}

class FakeUserRepo extends UserRepo {
  readonly rows = new Map<string, UserRecord>();
  seed(id: string, email: string): void {
    this.rows.set(id, {
      id,
      email,
      passwordHash: "x",
      displayName: null,
      emailVerifiedAt: null,
    } as UserRecord);
  }
  async findByEmail(email: string): Promise<UserRecord | null> {
    return [...this.rows.values()].find((u) => u.email === email) ?? null;
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async create(): Promise<never> {
    throw new Error("not used");
  }
  async updatePassword(): Promise<void> {}
  async markEmailVerified(): Promise<void> {}
}

class FakeAuditRepo extends AuditRepo {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

let commentSeq = 0;

class FakeCaseCommentRepo extends CaseCommentRepo {
  readonly rows: CaseCommentRecord[] = [];
  async create(input: {
    instanceId: string;
    authorId: string;
    authorName: string;
    body: string;
  }): Promise<CaseCommentRecord> {
    const row = { id: `cmt_${++commentSeq}`, createdAt: new Date(), ...input };
    this.rows.push(row);
    return row;
  }
  async listByInstance(instanceId: string): Promise<CaseCommentRecord[]> {
    return this.rows.filter((r) => r.instanceId === instanceId);
  }
}

class FakeMailService {
  readonly sent: { to: string; subject: string }[] = [];
  async send(to: string, content: { subject: string }): Promise<void> {
    this.sent.push({ to, subject: content.subject });
  }
}

const OWNER = "owner-a";
let instanceRepo: FakeWorkflowInstanceRepo;
let workflowRepo: FakeWorkflowRepo;
let projectRepo: FakeProjectRepo;
let memberRepo: FakeProjectMemberRepo;
let tenantRepo: FakeTenantRepo;
let rbacRepo: FakeRbacRepo;
let formRepo: FakeFormRepo;
let userRepo: FakeUserRepo;
let auditRepo: FakeAuditRepo;
let mail: FakeMailService;
let service: WorkflowInstancesService;
let commentRepo: FakeCaseCommentRepo;
let comments: CaseCommentsService;
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
  tenantRepo = new FakeTenantRepo();
  rbacRepo = new FakeRbacRepo();
  formRepo = new FakeFormRepo();
  userRepo = new FakeUserRepo();
  auditRepo = new FakeAuditRepo();
  mail = new FakeMailService();
  const projects = new ProjectsService(
    projectRepo,
    new FakeFolderRepo(),
    new FakeFormRepo(),
    memberRepo,
    tenantRepo,
    rbacRepo,
    new FakeOrgUnitRepo(),
  );
  service = new WorkflowInstancesService(
    instanceRepo,
    workflowRepo,
    projects,
    formRepo,
    new FakeFormVersionRepo(),
    tenantRepo,
    userRepo,
    auditRepo,
    mail as unknown as MailService,
  );
  // Phase E2. Tested in THIS file rather than its own: `CaseCommentsService` delegates every access
  // decision to the service above, so it needs the exact same fake graph — duplicating all of it
  // would only risk the two copies drifting apart.
  commentRepo = new FakeCaseCommentRepo();
  comments = new CaseCommentsService(commentRepo, service, projects, userRepo, auditRepo);
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

  it("keeps two cases started in the SAME millisecond apart (no silent overwrite)", async () => {
    await seedWorkflow();
    vi.useFakeTimers();
    try {
      // `upsert` writes by id, so a generated id that repeats does not fail — it REPLACES the case
      // started a moment earlier, losing it without a word.
      const a = await service.start(OWNER, "wf1", { data: { applicant: "Mai" } });
      const b = await service.start(OWNER, "wf1", { data: { applicant: "Nam" } });
      expect(a.id).not.toBe(b.id);
      await expect(service.list(OWNER, "wf1")).resolves.toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
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

/** A form whose `secret` field is only viewable by the `hr` role (FS2 field-level RBAC). */
function gatedForm(id = "f1"): FormSchema {
  return {
    formVersion: CURRENT_FORM_VERSION,
    id,
    title: "Case form",
    fields: [
      { type: "text", name: "subject", label: "Subject" },
      { type: "text", name: "secret", label: "Secret", permissions: { viewRoles: ["hr"] } },
    ],
  } as unknown as FormSchema;
}

describe("WorkflowInstancesService — running is its own permission (Phase E)", () => {
  const OPERATOR = "operator-1";
  const tenantId = FakeTenantRepo.tenantIdFor(OWNER);

  /** Make OPERATOR a tenant member holding exactly one function code. */
  function grantOperator(...functions: string[]): void {
    tenantRepo.join(OPERATOR, tenantId);
    rbacRepo.grant(OPERATOR, tenantId, functions);
  }

  it("lets a workflow.run holder start and advance, though they are only a viewer", async () => {
    await seedWorkflow();
    grantOperator("workflow.run");

    const started = await service.start(OPERATOR, "wf1");
    const advanced = await service.advance(OPERATOR, started.id, { action: "submit" });
    expect(advanced.current).toBe("review");
  });

  it("still refuses a read-only member (403, not 404 — they can see the project)", async () => {
    await seedWorkflow();
    grantOperator("workflow.read");

    await expect(service.start(OPERATOR, "wf1")).rejects.toBeInstanceOf(ForbiddenException);
    const started = await service.start(OWNER, "wf1");
    await expect(
      service.advance(OPERATOR, started.id, { action: "submit" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides the case entirely from someone with no grant at all (404)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await expect(
      service.advance("stranger", started.id, { action: "submit" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("records who advanced the case and denormalizes the new state", async () => {
    await seedWorkflow();
    grantOperator("workflow.run");
    const started = await service.start(OWNER, "wf1");

    const advanced = await service.advance(OPERATOR, started.id, { action: "submit" });
    expect(advanced.history.at(-1)?.actor).toBe(OPERATOR);
    expect(instanceRepo.meta.get(started.id)?.statusLabel).toBe("review");
  });
});

describe("WorkflowInstancesService.assign (Phase E)", () => {
  const MEMBER = "member-1";
  const tenantId = FakeTenantRepo.tenantIdFor(OWNER);

  beforeEach(() => {
    tenantRepo.join(OWNER, tenantId);
    tenantRepo.join(MEMBER, tenantId);
    userRepo.seed(MEMBER, "member@example.com");
  });

  it("assigns to a workspace member, audits it and emails them", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");

    const summary = await service.assign(OWNER, started.id, MEMBER);
    expect(summary.assigneeId).toBe(MEMBER);
    expect(auditRepo.entries).toEqual([
      expect.objectContaining({ action: "case.assign", tenantId, actorId: OWNER }),
    ]);
    expect(mail.sent).toEqual([expect.objectContaining({ to: "member@example.com" })]);
  });

  it("refuses someone who is not a member of the project's workspace (400)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await expect(service.assign(OWNER, started.id, "outsider")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("clears the assignment with null, without emailing anyone", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await service.assign(OWNER, started.id, MEMBER);
    mail.sent.length = 0;

    const summary = await service.assign(OWNER, started.id, null);
    expect(summary.assigneeId).toBeNull();
    expect(mail.sent).toEqual([]);
  });

  it("keeps the assignee when the case is later advanced (upsert must not clobber it)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await service.assign(OWNER, started.id, MEMBER);

    await service.advance(OWNER, started.id, { action: "submit" });
    const summary = await instanceRepo.findSummary(started.id);
    expect(summary?.assigneeId).toBe(MEMBER);
  });
});

describe("WorkflowInstancesService.updateWorkOrder (Phase E2)", () => {
  const OPERATOR = "operator-2";
  const tenantId = FakeTenantRepo.tenantIdFor(OWNER);
  const DUE = new Date("2026-08-15T09:00:00.000Z");

  it("sets a deadline and an urgency, and audits it", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");

    const summary = await service.updateWorkOrder(OWNER, started.id, { dueAt: DUE, priority: 3 });
    expect(summary.dueAt).toEqual(DUE);
    expect(summary.priority).toBe(3);
    expect(auditRepo.entries).toEqual([
      expect.objectContaining({ action: "case.set-work-order", tenantId, actorId: OWNER }),
    ]);
  });

  it("leaves the other attribute alone when only one is patched", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await service.updateWorkOrder(OWNER, started.id, { dueAt: DUE, priority: 3 });

    const summary = await service.updateWorkOrder(OWNER, started.id, { priority: 1 });
    expect(summary.priority).toBe(1);
    expect(summary.dueAt).toEqual(DUE);
  });

  it("clears the deadline with an explicit null", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await service.updateWorkOrder(OWNER, started.id, { dueAt: DUE });

    const summary = await service.updateWorkOrder(OWNER, started.id, { dueAt: null });
    expect(summary.dueAt).toBeNull();
    expect(summary.priority).toBe(2);
  });

  it("refuses an empty patch (400) instead of writing an empty audit entry", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");

    await expect(service.updateWorkOrder(OWNER, started.id, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(auditRepo.entries).toEqual([]);
  });

  it("refuses a read-only member (403) and hides the case from a stranger (404)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    tenantRepo.join(OPERATOR, tenantId);
    rbacRepo.grant(OPERATOR, tenantId, ["workflow.read"]);

    await expect(
      service.updateWorkOrder(OPERATOR, started.id, { priority: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateWorkOrder("stranger", started.id, { priority: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("keeps the deadline and urgency when the case is advanced (upsert must not clobber them)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await service.updateWorkOrder(OWNER, started.id, { dueAt: DUE, priority: 3 });

    await service.advance(OWNER, started.id, { action: "submit" });

    const summary = await instanceRepo.findSummary(started.id);
    expect(summary?.dueAt).toEqual(DUE);
    expect(summary?.priority).toBe(3);
  });
});

describe("CaseCommentsService (Phase E2)", () => {
  const OPERATOR = "operator-3";
  const READER = "reader-1";
  const tenantId = FakeTenantRepo.tenantIdFor(OWNER);

  beforeEach(() => {
    userRepo.seed(OWNER, "owner@example.com");
    tenantRepo.join(OPERATOR, tenantId);
    rbacRepo.grant(OPERATOR, tenantId, ["workflow.run"]);
    userRepo.seed(OPERATOR, "operator@example.com");
    tenantRepo.join(READER, tenantId);
    rbacRepo.grant(READER, tenantId, ["workflow.read"]);
    userRepo.seed(READER, "reader@example.com");
  });

  it("appends a comment, snapshots the author's name and audits it", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");

    const comment = await comments.add(OPERATOR, started.id, "Đang chờ hồ sơ gốc");
    expect(comment.body).toBe("Đang chờ hồ sơ gốc");
    expect(comment.authorId).toBe(OPERATOR);
    expect(comment.authorName).toBe("operator@example.com");
    expect(auditRepo.entries).toEqual([
      expect.objectContaining({ action: "case.comment", tenantId, actorId: OPERATOR }),
    ]);
  });

  it("keeps the comment text OUT of the audit trail", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await comments.add(OPERATOR, started.id, "số CMND 001234");

    expect(JSON.stringify(auditRepo.entries)).not.toContain("001234");
  });

  it("lets a read-only member READ the thread but not write to it (403)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");
    await comments.add(OPERATOR, started.id, "ghi chú");

    await expect(comments.list(READER, started.id)).resolves.toHaveLength(1);
    await expect(comments.add(READER, started.id, "tôi cũng muốn ghi")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("hides the thread entirely from someone with no grant (404, no existence leak)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1");

    await expect(comments.list("stranger", started.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(comments.add("stranger", started.id, "hi")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("scopes the thread to its own case", async () => {
    await seedWorkflow();
    // Explicit ids purely so the two cases read as distinct below.
    const a = await service.start(OWNER, "wf1", { id: "case-a" });
    const b = await service.start(OWNER, "wf1", { id: "case-b" });
    await comments.add(OWNER, a.id, "về case A");

    await expect(comments.list(OWNER, b.id)).resolves.toEqual([]);
  });
});

describe("WorkflowInstancesService — field-level RBAC on case data (Phase E)", () => {
  /** The workflow's start node binds the gated form. */
  function formBoundDef(): WorkflowDefinition {
    const d = def();
    d.nodes[0] = { ...d.nodes[0], formId: "f1" };
    return d;
  }

  beforeEach(async () => {
    formRepo.bodies.set("f1", gatedForm());
    await workflowRepo.upsert(formBoundDef(), { projectId: project.id });
  });

  it("masks fields the reader may not view, on both load and the advance response", async () => {
    // OWNER's project role is `owner`, which is not the `hr` role the field is gated to.
    const started = await service.start(OWNER, "wf1", { data: { subject: "s", secret: "top" } });
    expect(started.data).toEqual({ subject: "s" });

    const loaded = await service.load(OWNER, started.id);
    expect(loaded.data).toEqual({ subject: "s" });

    const advanced = await service.advance(OWNER, started.id, { action: "submit" });
    expect(advanced.data).not.toHaveProperty("secret");
  });

  it("shows the field to a reader who declares the gating role", async () => {
    const started = await service.start(OWNER, "wf1", { data: { subject: "s", secret: "top" } });
    const loaded = await service.load(OWNER, started.id, ["hr"]);
    expect(loaded.data).toEqual({ subject: "s", secret: "top" });
  });

  it("stores the unmasked value, so a reader who cannot see it cannot erase it", async () => {
    const started = await service.start(OWNER, "wf1", { data: { subject: "s", secret: "top" } });
    // The masked reader echoes back what they saw — the hidden field must survive.
    await service.advance(OWNER, started.id, { action: "submit", data: { subject: "s2" } });
    expect(instanceRepo.bodies.get(started.id)?.data).toEqual({ subject: "s2", secret: "top" });
  });
});

describe("WorkflowInstancesService — reviewer-found hardening (Phase E)", () => {
  it("refuses to start a case whose id already exists (409, never overwrites)", async () => {
    await seedWorkflow();
    const started = await service.start(OWNER, "wf1", { id: "case-x", data: { subject: "first" } });

    await expect(service.start(OWNER, "wf1", { id: "case-x" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(instanceRepo.bodies.get(started.id)?.data).toEqual({ subject: "first" });
  });

  it("never derives the case label from a role-gated field", async () => {
    // `deriveCaseLabel` takes the first non-empty string — here that would be the gated `secret`.
    // The label is stored once and shown to everyone (list, email, `?q=` search), so it must come
    // from the ungated subset only.
    formRepo.bodies.set("f1", gatedForm());
    const d = def();
    d.nodes[0] = { ...d.nodes[0], formId: "f1" };
    await workflowRepo.upsert(d, { projectId: project.id });

    const started = await service.start(OWNER, "wf1", {
      data: { secret: "TOP SECRET", subject: "Đơn nghỉ phép" },
    });
    const summary = await instanceRepo.findSummary(started.id);
    expect(summary?.label).toBe("Đơn nghỉ phép");
  });
});
