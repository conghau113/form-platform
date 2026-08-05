import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins the two database invariants no unit test can reach, because they live in Postgres rather
 * than in code. Both are load-bearing:
 *
 * - without the unique index, two seeded bindings for the same `(tenant, ticketTypeCode,
 *   externalFormCode)` make resolution depend on row order — the endpoint would answer differently
 *   on different days;
 * - without the cascades, deleting a tenant leaves a live credential behind that still
 *   authenticates.
 *
 * Reading the migration rather than the Prisma schema is deliberate: the migration is what the
 * database actually ran. A `@@unique` added to `schema.prisma` but never migrated is exactly the
 * failure this is meant to catch.
 */
const read = (dir: string): string =>
  readFileSync(join(process.cwd(), "prisma/migrations", dir, "migration.sql"), "utf8");

const created = read("20260804000000_add_external_integration");
const widenedKey = read("20260805000000_external_binding_per_form_code");
/** Both files, in the order the database applies them. */
const migration = `${created}\n${widenedKey}`;

describe("external integration migration", () => {
  it("makes one (ticket type, form code) resolve to exactly one binding per tenant", () => {
    // P2-0 widened this key: the ticket type alone is not unique, because one ticket type has
    // several templates. Determinism now comes from all three columns together.
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "ExternalTicketTypeMap_binding_key" ON "ExternalTicketTypeMap"\("tenantId", "ticketTypeCode", "externalFormCode"\)/,
    );
  });

  it("drops the two-column key it replaces, rather than leaving both in force", () => {
    // Leaving the old index behind would keep rejecting the second template — the exact bug P2-0
    // exists to fix — while `schema.prisma` claimed otherwise.
    expect(created).toMatch(
      /CREATE UNIQUE INDEX "ExternalTicketTypeMap_tenantId_ticketTypeCode_key"/,
    );
    expect(widenedKey).toMatch(/DROP INDEX "ExternalTicketTypeMap_tenantId_ticketTypeCode_key"/);
  });

  it("names the new index short enough for Postgres to keep it verbatim", () => {
    // Prisma's default name for these three columns is 66 characters; Postgres truncates at 63, so
    // the name in the migration would stop matching the name in `schema.prisma`.
    const name = /CREATE UNIQUE INDEX "([^"]+)" ON "ExternalTicketTypeMap"/.exec(widenedKey)?.[1];
    expect(name).toBeDefined();
    expect((name as string).length).toBeLessThanOrEqual(63);
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
