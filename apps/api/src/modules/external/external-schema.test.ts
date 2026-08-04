import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins the two database invariants no unit test can reach, because they live in Postgres rather
 * than in code. Both are load-bearing:
 *
 * - without the unique index, two seeded bindings for the same `(tenant, ticketTypeCode)` make
 *   resolution depend on row order — the endpoint would answer differently on different days;
 * - without the cascades, deleting a tenant leaves a live credential behind that still
 *   authenticates.
 *
 * Reading the migration rather than the Prisma schema is deliberate: the migration is what the
 * database actually ran. A `@@unique` added to `schema.prisma` but never migrated is exactly the
 * failure this is meant to catch.
 */
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260804000000_add_external_integration/migration.sql"),
  "utf8",
);

describe("external integration migration", () => {
  it("makes one ticket type resolve to exactly one binding per tenant", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "ExternalTicketTypeMap_tenantId_ticketTypeCode_key"/,
    );
  });

  it("makes the key digest the unique lookup key", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX "ExternalApiKey_tokenHash_key"/);
  });

  it("cascades both tables from Tenant so no credential outlives its tenant", () => {
    for (const table of ["ExternalApiKey", "ExternalTicketTypeMap"]) {
      expect(migration).toMatch(
        new RegExp(
          `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tenantId_fkey"[^;]*REFERENCES "Tenant"\\("id"\\) ON DELETE CASCADE`,
        ),
      );
    }
  });

  it("stores no plaintext key column", () => {
    // The whole point of the RefreshToken pattern: there is nothing to leak but a digest.
    expect(migration).not.toMatch(/"(token|apiKey|secret|rawKey)"\s+TEXT/i);
  });
});
