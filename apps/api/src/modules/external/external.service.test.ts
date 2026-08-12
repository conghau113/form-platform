import {
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
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
import type { CheckTransitionDto } from "./dto/check-transition.dto.js";
import { FORBIDDEN_OUTPUT_KEYS } from "./evn-template.js";
import { ExternalService } from "./external.service.js";

/** A form carrying every kind of thing that must never leave: tenant Role codes, a remote-fetch
 *  endpoint, and the submit endpoint. Kept in the default fixture so every read path is covered,
 *  not just one test — `settings.submitUrl` shipped unredacted until a review caught it precisely
 *  because it was missing from here.
 *
 *  It must satisfy `formSchema` for real, not just the cast: the service migrates the frozen
 *  snapshot before reading it, exactly as a published body always could. `label` and the data
 *  source's `valueKey` are required, and were missing here while nothing ever parsed this. */
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
        label: "Lương",
        permissions: { viewRoles: ["hr-admin"], editRoles: ["hr-admin"] },
      },
      {
        name: "dept",
        type: "select",
        label: "Phòng ban",
        dataSource: {
          url: "https://internal.example/api/departments",
          labelKey: "n",
          valueKey: "id",
        },
      },
    ],
  }) as unknown as FormSchema;

class FakeAuditRepo extends AuditRepo {
  readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Matches the Prisma `findMany` filter — tenancy is IN the query, and an omitted `externalFormCode`
 *  returns every template of that ticket type rather than picking one. */
class FakeIntegrationRepo extends ExternalIntegrationRepo {
  readonly maps: ExternalTicketTypeMapRecord[] = [];

  async findActiveKeyByHash(): Promise<ExternalApiKeyRecord | null> {
    return null;
  }
  async findTicketTypeMaps(
    tenantId: string,
    ticketTypeCode: string,
    externalFormCode?: string,
  ): Promise<ExternalTicketTypeMapRecord[]> {
    return this.maps.filter(
      (m) =>
        m.tenantId === tenantId &&
        m.ticketTypeCode === ticketTypeCode &&
        (externalFormCode === undefined || m.externalFormCode === externalFormCode),
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

/** A second published template behind the *same* ticket type — EVN's `CT_PCT_PDF` next to `CPCT`. */
function seedSecondPctTemplate(): void {
  seedProject("p_a_pdf", "tenant_a");
  seedForm("form_pct_pdf", "p_a_pdf");
  seedVersion("form_pct_pdf", 1, "pdf-v1");
  versions.activeByForm.set("form_pct_pdf", 1);
  integrations.maps.push({
    id: "m_pdf",
    tenantId: "tenant_a",
    ticketTypeCode: "PCT",
    ticketTypeName: null,
    formId: "form_pct_pdf",
    externalFormCode: "CT_PCT_PDF",
    workflowId: null,
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
    ticketTypeName: null,
    formId: "form_pct",
    externalFormCode: "CPCT",
    workflowId: null,
  });
});

describe("ExternalService.getFormTemplate", () => {
  it("resolves the active version when no version is asked for", async () => {
    const result = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    expect(result.version).toBe(2);
    expect(result.template.formName).toBe("v2");
    expect(result.externalFormCode).toBe("CPCT");
    expect(result.formId).toBe("form_pct");
  });

  it("resolves an explicitly pinned version", async () => {
    const result = await service.getFormTemplate(callerFor("tenant_a"), "PCT", 1);
    expect(result.version).toBe(1);
    expect(result.template.formName).toBe("v1");
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
      ticketTypeName: null,
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
      ticketTypeName: null,
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
      ticketTypeName: null,
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
      ticketTypeName: null,
      formId: "form_pct",
      externalFormCode: "CPCT",
      workflowId: null,
    });
    // The ambiguous case gets its OWN ticket type on purpose. Making `PCT` ambiguous here would
    // short-circuit the `version: 99` attempt below at the ambiguity check, so "never published"
    // would silently stop being one of the messages this test compares.
    seedProject("p_a_amb", "tenant_a");
    seedForm("form_amb", "p_a_amb");
    for (const code of ["A1", "A2"]) {
      integrations.maps.push({
        id: `m_amb_${code}`,
        tenantId: "tenant_a",
        ticketTypeCode: "AMBIG",
        ticketTypeName: null,
        formId: "form_amb",
        externalFormCode: code,
        workflowId: null,
      });
    }
    const messages: string[] = [];
    for (const attempt of [
      () => service.getFormTemplate(callerFor("tenant_a"), "NOPE"),
      () => service.getFormTemplate(callerFor("tenant_b"), "PCT"),
      () => service.getFormTemplate(callerFor("tenant_a"), "PCT", 99),
      // Ambiguous — two templates, no `?formCode=`. Deliberately in the same set: a helpful
      // "specify formCode" reply here would be the first crack in the single-message rule.
      () => service.getFormTemplate(callerFor("tenant_a"), "AMBIG"),
    ]) {
      await attempt().catch((e: Error) => messages.push(e.message));
    }
    expect(messages).toHaveLength(4);
    expect(new Set(messages).size).toBe(1);
  });
});

/**
 * P2-0. D0-a shipped `@@unique([tenantId, ticketTypeCode])` — one form per ticket type. EVN's own
 * `templateJSON` files disprove that: `PCT` is backed by six templates. The fix widens the key, and
 * these tests pin the behaviour that has to come with it.
 */
describe("a ticket type with several templates", () => {
  beforeEach(seedSecondPctTemplate);

  it("serves the template named by formCode", async () => {
    const create = await service.getFormTemplate(callerFor("tenant_a"), "PCT", undefined, "CPCT");
    expect(create.formId).toBe("form_pct");
    expect(create.externalFormCode).toBe("CPCT");

    const pdf = await service.getFormTemplate(
      callerFor("tenant_a"),
      "PCT",
      undefined,
      "CT_PCT_PDF",
    );
    expect(pdf.formId).toBe("form_pct_pdf");
    expect(pdf.externalFormCode).toBe("CT_PCT_PDF");
  });

  it("404s rather than guessing when formCode is missing", async () => {
    // The whole point of P2-0: picking either one makes the answer depend on row order, and serving
    // the PDF variant where the create-ticket form was meant is invisible to the caller.
    await expect(service.getFormTemplate(callerFor("tenant_a"), "PCT")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("404s a formCode that is not bound", async () => {
    await expect(
      service.getFormTemplate(callerFor("tenant_a"), "PCT", undefined, "CT_PCT_M"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("still resolves a ticket type that has exactly one template without formCode", async () => {
    // Widening the key must not force `?formCode=` on the common case.
    seedProject("p_a3", "tenant_a");
    seedForm("form_lct", "p_a3");
    seedVersion("form_lct", 1, "lct-v1");
    versions.activeByForm.set("form_lct", 1);
    integrations.maps.push({
      id: "m_lct",
      tenantId: "tenant_a",
      ticketTypeCode: "LCT",
      ticketTypeName: null,
      formId: "form_lct",
      externalFormCode: "CLCT",
      workflowId: null,
    });
    const result = await service.getFormTemplate(callerFor("tenant_a"), "LCT");
    expect(result.formId).toBe("form_lct");
  });

  it("resolves formCode inside the caller's tenant, never across it", async () => {
    // Tenant B binds the SAME ticket type and the SAME form code onto its own form. Without a real
    // binding of its own this test would pass on an empty result set and prove nothing about
    // narrowing — it would only re-prove that tenant B has no rows.
    seedProject("p_b", "tenant_b");
    seedForm("form_pct_b", "p_b");
    seedVersion("form_pct_b", 1, "b-v1");
    versions.activeByForm.set("form_pct_b", 1);
    integrations.maps.push({
      id: "m_b",
      tenantId: "tenant_b",
      ticketTypeCode: "PCT",
      ticketTypeName: null,
      formId: "form_pct_b",
      externalFormCode: "CPCT",
      workflowId: null,
    });

    // Same ticket type, same form code, two tenants: each must receive its own form.
    const b = await service.getFormTemplate(callerFor("tenant_b"), "PCT", undefined, "CPCT");
    expect(b.formId).toBe("form_pct_b");
    const a = await service.getFormTemplate(callerFor("tenant_a"), "PCT", undefined, "CPCT");
    expect(a.formId).toBe("form_pct");

    // And a code bound only in tenant A stays invisible to B, even named exactly.
    await expect(
      service.getFormTemplate(callerFor("tenant_b"), "PCT", undefined, "CT_PCT_PDF"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("what leaves the platform", () => {
  it("carries no tenant Role code and no internal URL", async () => {
    // Until P2b this was guaranteed by a redaction pass over the whole form body. It is now
    // guaranteed by construction — the exporter builds each item from a fixed list of seven keys —
    // so this test is what keeps that property from being a claim in a docblock.
    const serialized = JSON.stringify(await service.getFormTemplate(callerFor("tenant_a"), "PCT"));
    expect(serialized).not.toContain("hr-admin");
    expect(serialized).not.toContain("internal.example");
    for (const key of FORBIDDEN_OUTPUT_KEYS) expect(serialized).not.toContain(`"${key}"`);
  });

  it("still carries the fields themselves, in EVN's shape", async () => {
    const { template } = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    // Both fixture fields are bare leaves at the root, so they are wrapped — see `evn-template`.
    expect(template.formItems).toHaveLength(1);
    expect(template.formItems[0].typeCode).toBe("CARD");
    const inner = template.formItems[0].children ?? [];
    expect(inner.map((i) => i.code)).toEqual(["salary", "dept"]);
    expect(inner.map((i) => i.typeCode)).toEqual(["NUMBER_INPUT", "SELECT"]);
  });

  it("names what it dropped instead of dropping it quietly", async () => {
    const { warnings } = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    // The fixture's `salary` carries `permissions`; both fields lose something in the crossing.
    expect(warnings.some((w) => w.includes("MỌI vai"))).toBe(true);
    expect(warnings.some((w) => w.includes("gói vào một thẻ"))).toBe(true);
  });

  it("does not mutate the stored version", async () => {
    // The repo hands out an object other callers share. An exporter that edited it in place would
    // strip field-level RBAC from the platform's own runtime.
    await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    const stored = await versions.load("form_pct", 2);
    expect(JSON.stringify(stored)).toContain("hr-admin");
  });

  it("omits formTypeName and warns when the binding never stated one", async () => {
    const { template, warnings } = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    expect(template).not.toHaveProperty("formTypeName");
    expect(warnings.some((w) => w.includes("tên hiển thị"))).toBe(true);
  });

  it("emits formTypeName when the binding states one", async () => {
    const map = integrations.maps.find((m) => m.id === "m1");
    if (map) map.ticketTypeName = "Công Tác";
    const { template, warnings } = await service.getFormTemplate(callerFor("tenant_a"), "PCT");
    expect(template.formTypeName).toBe("Công Tác");
    expect(warnings.some((w) => w.includes("tên hiển thị"))).toBe(false);
  });
});

/**
 * Frozen snapshots are stored as `Json` and can predate `CURRENT_FORM_VERSION`. Until P2b this path
 * handed the body straight back and the caller migrated it; now we read it ourselves, so the
 * migration has to happen here — every other consumer of a frozen body already does it.
 */
describe("the stored snapshot is migrated before it is read", () => {
  /** Publish `body` verbatim under ticket type `OLD`, bypassing the v3-shaped default fixture. */
  function seedRawBody(formId: string, raw: unknown): void {
    seedProject(`p_${formId}`, "tenant_a");
    seedForm(formId, `p_${formId}`);
    versions.rows.push({
      id: `${formId}_v1`,
      formId,
      version: 1,
      formVersion: 1,
      body: raw as FormSchema,
      publishedBy: "u1",
      publishedAt: new Date().toISOString(),
    });
    versions.activeByForm.set(formId, 1);
    integrations.maps.push({
      id: `m_${formId}`,
      tenantId: "tenant_a",
      ticketTypeCode: "OLD",
      ticketTypeName: null,
      formId,
      externalFormCode: "COLD",
      workflowId: null,
    });
  }

  it("warns about a v2 field hidden with `show`, which only the 2->3 migration renames", async () => {
    // The failure this pins is silent, which is why it needs its own test: read raw, `show: false`
    // is a key nothing looks at, so a field the author deliberately hid crosses over visible to
    // every EVN user and `warnings` says nothing at all. Migrated, it is `visibleWhen` and named.
    seedRawBody("form_v2", {
      formVersion: 2,
      id: "form_v2",
      title: "v2",
      fields: [
        { type: "card", children: [{ name: "secret", type: "text", label: "S", show: false }] },
      ],
    });

    const { warnings } = await service.getFormTemplate(callerFor("tenant_a"), "OLD");
    expect(warnings.some((w) => w.includes("ẩn/hiện"))).toBe(true);
  });

  it("reports a snapshot that will not migrate as a server fault, not as the tenant's 422", async () => {
    // Publishing migrates before freezing, so an unparseable row means this node is older than the
    // document or the row is damaged — nothing the tenant can fix by editing their form. A 422 would
    // send them to rewrite a form that is fine. It must also not escape as a raw `TypeError` from
    // deep in the walk, which is what a container with no `children` used to produce.
    seedRawBody("form_broken", {
      formVersion: 1,
      id: "form_broken",
      title: "broken",
      fields: [{ type: "card" }],
    });

    const error = await service
      .getFormTemplate(callerFor("tenant_a"), "OLD")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    // The status itself, not just the class: 422 is the one status on this surface that tells the
    // tenant to go edit their form, and that is the wrong instruction here.
    expect((error as InternalServerErrorException).getStatus()).toBe(500);
    expect(audit.entries).toEqual([]);
  });

  it("still answers 404, not 500, when the unmigratable form belongs to another tenant", async () => {
    // The 500 is a new failure class, so it needs the same ordering proof the 422 has: a binding
    // scoped to tenant A pointing at a form in tenant B's project. Answering 500 here would confirm
    // the form exists — the existence oracle every 404 on this surface is shaped to deny.
    seedProject("p_b_broken", "tenant_b");
    seedForm("form_b_broken", "p_b_broken");
    versions.rows.push({
      id: "form_b_broken_v1",
      formId: "form_b_broken",
      version: 1,
      formVersion: 1,
      body: {
        formVersion: 1,
        id: "form_b_broken",
        title: "broken",
        fields: [{ type: "card" }],
      } as unknown as FormSchema,
      publishedBy: "u1",
      publishedAt: new Date().toISOString(),
    });
    versions.activeByForm.set("form_b_broken", 1);
    integrations.maps.push({
      id: "m_b_broken",
      tenantId: "tenant_a",
      ticketTypeCode: "BROKENLEAK",
      ticketTypeName: null,
      formId: "form_b_broken",
      externalFormCode: "CBROKENLEAK",
      workflowId: null,
    });

    const error = await service
      .getFormTemplate(callerFor("tenant_a"), "BROKENLEAK")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("reports a `type` outside our union the same way, rather than throwing mid-walk", async () => {
    seedRawBody("form_future", {
      formVersion: 1,
      id: "form_future",
      title: "future",
      fields: [{ name: "x", type: "future-widget" }],
    });

    const error = await service
      .getFormTemplate(callerFor("tenant_a"), "OLD")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InternalServerErrorException);
  });
});

describe("422 — the form is theirs but cannot be exported", () => {
  /** Rebind `PCT` onto a freshly published form whose body is `fields`. */
  function seedUnexportable(tenantId: string, formId: string, fields: unknown[]): void {
    seedProject(`p_${formId}`, tenantId);
    seedForm(formId, `p_${formId}`);
    versions.rows.push({
      id: `${formId}_v1`,
      formId,
      version: 1,
      formVersion: 1,
      body: { formVersion: 1, id: formId, title: formId, fields } as unknown as FormSchema,
      publishedBy: "u1",
      publishedAt: new Date().toISOString(),
    });
    versions.activeByForm.set(formId, 1);
    integrations.maps.push({
      id: `m_${formId}`,
      tenantId,
      ticketTypeCode: "UNEXPORTABLE",
      ticketTypeName: null,
      formId,
      externalFormCode: "CUNEXP",
      workflowId: null,
    });
  }

  it("422s with our own field names and reasons", async () => {
    seedUnexportable("tenant_a", "form_bad", [
      { name: "pin", type: "password", label: "PIN" },
      { name: "start", type: "time", label: "Giờ" },
    ]);
    const error = await service
      .getFormTemplate(callerFor("tenant_a"), "UNEXPORTABLE")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    const response = (error as UnprocessableEntityException).getResponse() as {
      errors: { field: string; reason: string }[];
    };
    expect(response.errors.map((e) => e.field)).toEqual(["pin", "start"]);
    // Our vocabulary only — the receiver's type codes must not travel back to the caller.
    for (const { reason } of response.errors) expect(reason).not.toMatch(/[A-Z]{2,}_[A-Z]+/);
  });

  it("records nothing in the audit trail — a 422 is not a read", async () => {
    seedUnexportable("tenant_a", "form_bad2", [{ name: "pin", type: "password", label: "PIN" }]);
    await service.getFormTemplate(callerFor("tenant_a"), "UNEXPORTABLE").catch(() => undefined);
    expect(audit.entries).toEqual([]);
  });

  it("cannot be reached before the tenancy check on the form itself", async () => {
    // The security-relevant ordering, and the reason it needs its own test: a binding row scoped to
    // tenant A pointing at a form that lives in tenant B's project. That row passes the binding
    // lookup and only `assertFormBelongsToTenant` stops it. If the export ran first, the caller
    // would get a 422 listing tenant B's field names — an existence oracle plus a data leak, out of
    // a mis-seeded row. The answer has to stay the same opaque 404.
    seedProject("p_b_leak", "tenant_b");
    seedForm("form_leak", "p_b_leak");
    versions.rows.push({
      id: "form_leak_v1",
      formId: "form_leak",
      version: 1,
      formVersion: 1,
      body: {
        formVersion: 1,
        id: "form_leak",
        title: "leak",
        fields: [{ name: "secret_pin", type: "password", label: "PIN" }],
      } as unknown as FormSchema,
      publishedBy: "u1",
      publishedAt: new Date().toISOString(),
    });
    versions.activeByForm.set("form_leak", 1);
    integrations.maps.push({
      id: "m_leak",
      tenantId: "tenant_a",
      ticketTypeCode: "LEAK",
      ticketTypeName: null,
      formId: "form_leak",
      externalFormCode: "CLEAK",
      workflowId: null,
    });

    const error = await service
      .getFormTemplate(callerFor("tenant_a"), "LEAK")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(JSON.stringify(error)).not.toContain("secret_pin");
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
        // `externalFormCode` too: with six templates per ticket type the trail would otherwise not
        // say which one was read.
        detail: { ticketTypeCode: "PCT", externalFormCode: "CPCT", version: 2 },
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

describe("checkTransition — the seam between the DTO and the decision (P4b)", () => {
  const dto = (over: Partial<CheckTransitionDto> = {}): CheckTransitionDto =>
    ({
      ticketId: 123,
      ticketTypeCode: "PCT",
      currentStatusCode: "PCT_S_WORKING",
      actionCode: "PCT_A_ALLOW",
      executorUserCode: "emp001",
      ...over,
    }) as CheckTransitionDto;

  it("carries every field the decision needs across", () => {
    // The mapping is five assignments and nothing type-checks that they are the RIGHT five: swap
    // `currentStatusCode` for `actionCode` and the compiler is happy. This is the only test that
    // would notice.
    expect(service.checkTransition(dto())).toMatchObject({
      coverage: "TABLE",
      ambiguousNext: ["PCT_S_ALLOWED_WAITING", "PCT_S_ALLOWED"],
    });
    expect(service.checkTransition(dto({ actionCode: "PCT_A_WORKING" })).coverage).toBe(
      "TABLE_INCOMPLETE",
    );
  });

  it("passes an ABSENT ticketRoles through as absent, never as an empty list", () => {
    // The two are different answers, and the difference is a refusal. `[]` says "we asked: nobody
    // holds a role on this ticket", so the executor holds none either and C reports what EVN's gate
    // would — `allowed: false`. Absent says "we were not told", which must never harden into a
    // refusal. A `dto.ticketRoles ?? []` in the mapping would turn every request EVN sends today —
    // their §12.C body carries no roles at all — into a wrongful rejection, with every test on the
    // pure function still green.
    const untold = service.checkTransition(dto());
    expect(untold.allowed).toBe(true);
    expect(untold.ambiguousNext).toHaveLength(2);

    const noRolesOnTicket = service.checkTransition(dto({ ticketRoles: [] }));
    expect(noRolesOnTicket.allowed).toBe(false);
  });

  it("derives the executor's own roles, not every role on the ticket", () => {
    const refused = service.checkTransition(
      dto({
        ticketRoles: [
          { roleCode: "PCT_R_CHO_PHEP", userCode: "someone-else" },
          { roleCode: "PCT_R_NHAN_VIEN", userCode: "emp001" },
        ],
      }),
    );
    expect(refused.allowed).toBe(false);
  });

  it("touches no repository and writes no audit entry", () => {
    // Called on every action a user considers, so an entry per call would turn "who read our form
    // templates" into an access log. Asserted rather than assumed, because adding an `audit.record`
    // here would look like consistency with the method above it.
    service.checkTransition(dto());
    expect(audit.entries).toEqual([]);
  });

  it("carries ticketData across, so the content guard is actually evaluated (P4c)", () => {
    // The same "five assignments, none of them type-checked" problem as above: dropping this one
    // line leaves every test on the pure function green while the endpoint silently stops
    // evaluating content and reports every pair as unverified.
    const complete = service.checkTransition(
      dto({
        actionCode: "PCT_A_END",
        currentStatusCode: "PCT_S_ALLOWED",
        ticketData: { PARTICIPANTS_WORKSITE: [{ MARKED: true }] },
      }),
    );
    expect(complete.unverifiedFields).toEqual([]);
    expect(complete.outOfScopeGuards).not.toContain("CONTENT_FINISHED");
  });

  it("turns an unreadable ticketData into a 422, not a verdict (P4c)", () => {
    // The one error this endpoint answers with. It must be an exception rather than a body: a
    // caller must never be able to read `allowed` off a reply we did not compute.
    let thrown: unknown;
    try {
      service.checkTransition(
        dto({
          actionCode: "PCT_A_END",
          currentStatusCode: "PCT_S_ALLOWED",
          ticketData: { PARTICIPANTS_WORKSITE: "Trạm 110kV Thủ Đức" },
        }),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toEqual({
      statusCode: 422,
      message: "ticketData cannot be evaluated",
      errors: [
        "PARTICIPANTS_WORKSITE: expected an array of rows, or an object with a `data` array",
      ],
    });
    // A failed evaluation is not a read, and this path writes nothing either way.
    expect(audit.entries).toEqual([]);
  });
});
