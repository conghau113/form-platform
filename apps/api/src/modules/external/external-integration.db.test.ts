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

  it("refuses a second binding for the same (tenant, ticketTypeCode)", async () => {
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
    // tenantA's PCT exists (seeded above); tenantB asking for it must not receive tenantA's row.
    const own = await repo.findTicketTypeMap(tenantA, "PCT");
    const other = await repo.findTicketTypeMap(tenantB, "PCT");
    expect(own?.formId).toBe("form_1");
    expect(other?.formId).toBe("form_3");
    expect(await repo.findTicketTypeMap(tenantA, "NOPE")).toBeNull();
  });
});
