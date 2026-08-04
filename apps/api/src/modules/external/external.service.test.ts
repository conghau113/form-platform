import { NotFoundException } from "@nestjs/common";
import type { FormSchema, FormVersion } from "@org/form-schema";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuditEntry } from "../../persistence/repositories/audit.repo.js";
import { AuditRepo } from "../../persistence/repositories/audit.repo.js";
import type {
  ExternalApiKeyRecord,
  ExternalTicketTypeMapRecord,
} from "../../persistence/repositories/external-integration.repo.js";
import { ExternalIntegrationRepo } from "../../persistence/repositories/external-integration.repo.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import { FormVersionRepo } from "../../persistence/repositories/form-version.repo.js";
import type { ProjectRecord } from "../../persistence/repositories/project.repo.js";
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";
import { ExternalService } from "./external.service.js";

/** A form carrying every kind of thing that must never leave: tenant Role codes, a remote-fetch
 *  endpoint, and the submit endpoint. Kept in the default fixture so every read path is covered,
 *  not just one test — `settings.submitUrl` shipped unredacted until a review caught it precisely
 *  because it was missing from here. */
const body = (title: string): FormSchema =>
  ({
    formVersion: 1,
    id: "f1",
    title,
    settings: { submitUrl: "https://internal.example/api/forms/f1/submissions" },
    fields: [
      {
        name: "salary",
        type: "number",
        permissions: { viewRoles: ["hr-admin"], editRoles: ["hr-admin"] },
      },
      {
        name: "dept",
        type: "select",
        dataSource: { url: "https://internal.example/api/departments", labelKey: "n" },
      },
    ],
  }) as unknown as FormSchema;

class FakeAuditRepo extends AuditRepo {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Matches the Prisma `findUnique` on `(tenantId, ticketTypeCode)` — tenancy is IN the query. */
class FakeIntegrationRepo extends ExternalIntegrationRepo {
  readonly maps: ExternalTicketTypeMapRecord[] = [];

  async findActiveKeyByHash(): Promise<ExternalApiKeyRecord | null> {
    return null;
  }
  async findTicketTypeMap(
    tenantId: string,
    ticketTypeCode: string,
  ): Promise<ExternalTicketTypeMapRecord | null> {
    return (
      this.maps.find((m) => m.tenantId === tenantId && m.ticketTypeCode === ticketTypeCode) ?? null
    );
  }
}

/** Note what this fake does NOT do: it takes no tenant argument, exactly like the real repo. That
 *  is the reason the service needs its own second check — the fake must not paper over it. */
class FakeFormRepo extends FormRepo {
  readonly summaries = new Map<string, FormSummary>();
  async upsert(): Promise<FormSchema> {
    throw new Error("not used");
  }
  async load(): Promise<FormSchema | null> {
    return null;
  }
  async findSummary(id: string): Promise<FormSummary | null> {
    return this.summaries.get(id) ?? null;
  }
  async listSummaries(): Promise<FormSummary[]> {
    return [];
  }
  async move(): Promise<FormSummary | null> {
    return null;
  }
  async delete(): Promise<void> {}
}

class FakeFormVersionRepo extends FormVersionRepo {
  readonly rows: FormVersion[] = [];
  /** Mirrors `activeVersion`: the highest published sequence, or none when never published. */
  activeByForm = new Map<string, number>();

  async publish(): Promise<FormVersion> {
    throw new Error("not used");
  }
  async loadActive(formId: string): Promise<FormVersion | null> {
    const v = this.activeByForm.get(formId);
    return v === undefined ? null : this.load(formId, v);
  }
  async load(formId: string, version: number): Promise<FormVersion | null> {
    return this.rows.find((r) => r.formId === formId && r.version === version) ?? null;
  }
  async listByForm(): Promise<never[]> {
    return [];
  }
}

class FakeProjectRepo extends ProjectRepo {
  readonly projects = new Map<string, ProjectRecord>();
  async ensureUnfiled(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async create(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async list(): Promise<ProjectRecord[]> {
    return [];
  }
  async findById(id: string): Promise<ProjectRecord | null> {
    return this.projects.get(id) ?? null;
  }
  async findByIds(): Promise<ProjectRecord[]> {
    return [];
  }
  async listByTenants(): Promise<ProjectRecord[]> {
    return [];
  }
  async update(): Promise<ProjectRecord> {
    throw new Error("not used");
  }
  async delete(): Promise<void> {}
}

let integrations: FakeIntegrationRepo;
let forms: FakeFormRepo;
let versions: FakeFormVersionRepo;
let projects: FakeProjectRepo;
let audit: FakeAuditRepo;
let service: ExternalService;

/** The tests below name a tenant far more often than a key, so keep the caller shape out of the way. */
const callerFor = (tenantId: string) => ({ keyId: `key_${tenantId}`, tenantId });

function seedProject(id: string, tenantId: string): void {
  projects.projects.set(id, {
    id,
    ownerId: "u1",
    tenantId,
    orgUnitId: null,
    name: id,
    slug: id,
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function seedForm(formId: string, projectId: string): void {
  forms.summaries.set(formId, {
    id: formId,
    projectId,
    folderId: null,
    title: formId,
    status: null,
    updatedAt: new Date(),
  });
}

function seedVersion(formId: string, version: number, title: string): void {
  versions.rows.push({
    id: `${formId}_v${version}`,
    formId,
    version,
    formVersion: 1,
    body: body(title),
    publishedBy: "u1",
    publishedAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  integrations = new FakeIntegrationRepo();
  forms = new FakeFormRepo();
  versions = new FakeFormVersionRepo();
  projects = new FakeProjectRepo();
  audit = new FakeAuditRepo();
  service = new ExternalService(integrations, forms, versions, projects, audit);

  // Tenant A: a PCT binding onto a published form in its own project.
  seedProject("p_a", "tenant_a");
  seedForm("form_pct", "p_a");
  seedVersion("form_pct", 1, "v1");
  seedVersion("form_pct", 2, "v2");
  versions.activeByForm.set("form_pct", 2);
  integrations.maps.push({
    id: "m1",
    tenantId: "tenant_a",
    ticketTypeCode: "PCT",
    formId: "form_pct",
    externalFormCode: "CPCT",
    workflowId: null,
  });
});

describe("ExternalService.getFormTemplate", () => {
  it("resolves the active version when no version is asked for", async () => {
    const result = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    expect(result.version).toBe(2);
    expect(result.body.title).toBe("v2");
    expect(result.externalFormCode).toBe("CPCT");
    expect(result.formId).toBe("form_pct");
  });

  it("resolves an explicitly pinned version", async () => {
    const result = await service.getFormTemplate(callerFor("tenant_a"), "PCT", 1);
    expect(result.version).toBe(1);
    expect(result.body.title).toBe("v1");
  });

  it("404s an unknown ticket type", async () => {
    await expect(service.getFormTemplate(callerFor("tenant_a"), "LCT")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s a version that was never published", async () => {
    await expect(service.getFormTemplate(callerFor("tenant_a"), "PCT", 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s a form with no published version — never serves a draft", async () => {
    seedProject("p_a2", "tenant_a");
    seedForm("form_draft", "p_a2");
    integrations.maps.push({
      id: "m2",
      tenantId: "tenant_a",
      ticketTypeCode: "DRAFTY",
      formId: "form_draft",
      externalFormCode: "CDRAFT",
      workflowId: null,
    });
    await expect(service.getFormTemplate(callerFor("tenant_a"), "DRAFTY")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s another tenant's ticket type instead of resolving it", async () => {
    // Layer 1: the binding lookup is tenant-scoped, so tenant B's key finds nothing.
    await expect(service.getFormTemplate(callerFor("tenant_b"), "PCT")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s when a mis-seeded binding points at another tenant's form", async () => {
    // Layer 2 — the reason the service re-derives the owner. `FormRepo`/`FormVersionRepo` take no
    // tenant argument and this path never passes through `requireAccess`, so a single bad row would
    // otherwise hand tenant A's form to tenant B. Remove `assertFormBelongsToTenant` and this test
    // goes red while every other test here stays green.
    integrations.maps.push({
      id: "m3",
      tenantId: "tenant_b",
      ticketTypeCode: "PCT",
      formId: "form_pct", // belongs to project p_a, owned by tenant_a
      externalFormCode: "CPCT",
      workflowId: null,
    });
    await expect(service.getFormTemplate(callerFor("tenant_b"), "PCT")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s when the binding points at a form that no longer exists", async () => {
    integrations.maps.push({
      id: "m4",
      tenantId: "tenant_a",
      ticketTypeCode: "GONE",
      formId: "form_deleted",
      externalFormCode: "CGONE",
      workflowId: null,
    });
    await expect(service.getFormTemplate(callerFor("tenant_a"), "GONE")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("gives one indistinguishable message to every failure", async () => {
    // "Unknown ticket type", "wrong tenant" and "never published" must read identically, or the
    // endpoint becomes an existence oracle for another tenant's configuration.
    integrations.maps.push({
      id: "m5",
      tenantId: "tenant_b",
      ticketTypeCode: "PCT",
      formId: "form_pct",
      externalFormCode: "CPCT",
      workflowId: null,
    });
    const messages: string[] = [];
    for (const attempt of [
      () => service.getFormTemplate(callerFor("tenant_a"), "NOPE"),
      () => service.getFormTemplate(callerFor("tenant_b"), "PCT"),
      () => service.getFormTemplate(callerFor("tenant_a"), "PCT", 99),
    ]) {
      await attempt().catch((e: Error) => messages.push(e.message));
    }
    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });
});

describe("what leaves the platform", () => {
  it("strips tenant Role codes and internal URLs from the body it returns", async () => {
    const result = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("hr-admin");
    expect(serialized).not.toContain("internal.example");
    expect(serialized).not.toContain("permissions");
  });

  it("keeps everything else the caller actually needs", async () => {
    const result = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    const fields = (result.body as unknown as { fields: { name: string; type: string }[] }).fields;
    expect(fields.map((f) => f.name)).toEqual(["salary", "dept"]);
    expect(fields.map((f) => f.type)).toEqual(["number", "select"]);
    // The container survives redaction — only the `url` key inside it goes.
    expect(fields[1]).toHaveProperty("dataSource.labelKey", "n");
  });

  it("does not mutate the stored version while redacting", async () => {
    // The repo hands out an object other callers share. Redacting in place would strip field-level
    // RBAC from the platform's own runtime — a far worse bug than the leak it was meant to fix.
    await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    const stored = await versions.load("form_pct", 2);
    expect(JSON.stringify(stored)).toContain("hr-admin");
  });
});

describe("audit", () => {
  it("records a successful read against the key, not a user", async () => {
    await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    expect(audit.entries).toEqual([
      {
        tenantId: "tenant_a",
        actorId: "key_tenant_a",
        action: "external.form-template.read",
        targetType: "form",
        targetId: "form_pct",
        detail: { ticketTypeCode: "PCT", version: 2 },
      },
    ]);
  });

  it("records nothing when the read fails", async () => {
    // A 404 tells the caller nothing, and logging every miss would let anyone holding any valid key
    // flood another tenant's trail with noise.
    await service.getFormTemplate(callerFor("tenant_a"), "NOPE").catch(() => undefined);
    await service.getFormTemplate(callerFor("tenant_b"), "PCT").catch(() => undefined);
    expect(audit.entries).toEqual([]);
  });
});
