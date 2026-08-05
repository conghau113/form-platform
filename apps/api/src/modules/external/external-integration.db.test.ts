import { execSync } from "node:child_process";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../persistence/prisma/prisma.service.js";
import { PrismaExternalIntegrationRepo } from "../../persistence/prisma/prisma-external-integration.repo.js";
import { hashApiKey } from "./api-key.guard.js";

/** Same Docker probe as `import-files-to-db.test.ts`: skip cleanly where no daemon is reachable
 *  rather than failing the whole `pnpm test` run. */
function hasDocker(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * The half of D0-a that only a real database can answer. `external-schema.test.ts` proves the
 * migration *text* declares these constraints; this proves Postgres actually enforces them — which
 * is a different claim, and the one that matters. A `@@unique` that was written but never migrated
 * passes the text test and fails here.
 *
 * That second claim only holds because the container is built with `migrate deploy` and not
 * `db push`: `db push` applies `schema.prisma` directly and never opens `prisma/migrations/`, so a
 * constraint that exists in the schema but was left out of the migration would be pushed in and
 * every assertion below would pass. Deploying the chain also proves all 17 migrations still apply
 * cleanly to an empty database, which is what a fresh install actually does.
 */
describe.skipIf(!hasDocker())("external integration constraints (real Postgres)", () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    const dbUrl = container.getConnectionUri();
    process.env.DATABASE_URL = dbUrl;
    execSync("pnpm exec prisma migrate deploy", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "ignore",
    });
    prisma = new PrismaService();
    await prisma.$connect();

    const a = await prisma.tenant.create({ data: { name: "A", slug: "tenant-a" } });
    const b = await prisma.tenant.create({ data: { name: "B", slug: "tenant-b" } });
    tenantA = a.id;
    tenantB = b.id;
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  it("refuses a second binding for the same (tenant, ticketTypeCode, externalFormCode)", async () => {
    const row = {
      tenantId: tenantA,
      ticketTypeCode: "PCT",
      formId: "form_1",
      externalFormCode: "CPCT",
    };
    await prisma.externalTicketTypeMap.create({ data: row });
    await expect(
      prisma.externalTicketTypeMap.create({ data: { ...row, formId: "form_2" } }),
    ).rejects.toThrow();
  });

  it("accepts a second template for the same ticket type under a different form code", async () => {
    // P2-0, and the reason the old two-column key was wrong: EVN's `PCT` is backed by six
    // templates. Under the shipped constraint this insert was a P2002 and a tenant could bind only
    // one of them. Its own tenant, so the ambiguity it creates stays out of the other tests.
    const tenant = await prisma.tenant.create({ data: { name: "Multi", slug: "tenant-multi" } });
    const base = { tenantId: tenant.id, ticketTypeCode: "PCT" };
    await prisma.externalTicketTypeMap.create({
      data: { ...base, formId: "form_create", externalFormCode: "CPCT" },
    });
    await expect(
      prisma.externalTicketTypeMap.create({
        data: { ...base, formId: "form_pdf", externalFormCode: "CT_PCT_PDF" },
      }),
    ).resolves.toBeTruthy();

    const repo = new PrismaExternalIntegrationRepo(prisma);
    // Both reachable, and the narrowed lookup picks exactly one.
    expect(await repo.findTicketTypeMaps(tenant.id, "PCT")).toHaveLength(2);
    const pdf = await repo.findTicketTypeMaps(tenant.id, "PCT", "CT_PCT_PDF");
    expect(pdf.map((m) => m.formId)).toEqual(["form_pdf"]);
  });

  it("lets a different tenant use the same ticketTypeCode", async () => {
    // The constraint must be per tenant, not global — every tenant calls their work permit "PCT".
    await expect(
      prisma.externalTicketTypeMap.create({
        data: {
          tenantId: tenantB,
          ticketTypeCode: "PCT",
          formId: "form_3",
          externalFormCode: "CPCT",
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("refuses two keys with the same digest", async () => {
    const tokenHash = hashApiKey("shared-secret");
    await prisma.externalApiKey.create({ data: { tenantId: tenantA, label: "one", tokenHash } });
    await expect(
      prisma.externalApiKey.create({ data: { tenantId: tenantB, label: "two", tokenHash } }),
    ).rejects.toThrow();
  });

  it("deletes credentials and bindings with their tenant", async () => {
    const doomed = await prisma.tenant.create({ data: { name: "C", slug: "tenant-c" } });
    await prisma.externalApiKey.create({
      data: { tenantId: doomed.id, label: "c", tokenHash: hashApiKey("c-key") },
    });
    await prisma.externalTicketTypeMap.create({
      data: {
        tenantId: doomed.id,
        ticketTypeCode: "LCT",
        formId: "form_c",
        externalFormCode: "CLCT",
      },
    });

    await prisma.tenant.delete({ where: { id: doomed.id } });

    // The point: a credential outliving its tenant would still authenticate.
    expect(await prisma.externalApiKey.count({ where: { tenantId: doomed.id } })).toBe(0);
    expect(await prisma.externalTicketTypeMap.count({ where: { tenantId: doomed.id } })).toBe(0);
  });

  it("does not return a revoked key through the repo", async () => {
    // The `revokedAt: null` filter lives in the query, so this is the only place it can be checked
    // against the real thing rather than against a fake that mirrors it.
    const repo = new PrismaExternalIntegrationRepo(prisma);
    const tokenHash = hashApiKey("to-be-revoked");
    const key = await prisma.externalApiKey.create({
      data: { tenantId: tenantA, label: "temp", tokenHash },
    });
    expect(await repo.findActiveKeyByHash(tokenHash)).not.toBeNull();

    await prisma.externalApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    });
    expect(await repo.findActiveKeyByHash(tokenHash)).toBeNull();
  });

  it("scopes the binding lookup by tenant", async () => {
    const repo = new PrismaExternalIntegrationRepo(prisma);
    // Its own tenants, so this no longer depends on rows the earlier tests happened to leave
    // behind — one of them now binds a second PCT template deliberately.
    const [one, two] = await Promise.all([
      prisma.tenant.create({ data: { name: "Scope one", slug: "tenant-scope-1" } }),
      prisma.tenant.create({ data: { name: "Scope two", slug: "tenant-scope-2" } }),
    ]);
    await prisma.externalTicketTypeMap.createMany({
      data: [
        { tenantId: one.id, ticketTypeCode: "PCT", formId: "form_one", externalFormCode: "CPCT" },
        // A DIFFERENT form code, so the cross-tenant assertion below names a code that really
        // exists — just not for the tenant asking.
        {
          tenantId: two.id,
          ticketTypeCode: "PCT",
          formId: "form_two",
          externalFormCode: "CT_PCT_PDF",
        },
      ],
    });

    // Every tenant calls their work permit "PCT"; neither may receive the other's row.
    expect((await repo.findTicketTypeMaps(one.id, "PCT")).map((m) => m.formId)).toEqual([
      "form_one",
    ]);
    expect((await repo.findTicketTypeMaps(two.id, "PCT")).map((m) => m.formId)).toEqual([
      "form_two",
    ]);
    expect(await repo.findTicketTypeMaps(one.id, "NOPE")).toEqual([]);
    // `CT_PCT_PDF` is a real, bound form code — for the *other* tenant. Naming it exactly still
    // resolves to nothing, which is the claim `formCode` narrows and never widens.
    expect(await repo.findTicketTypeMaps(one.id, "PCT", "CT_PCT_PDF")).toEqual([]);
  });
});
