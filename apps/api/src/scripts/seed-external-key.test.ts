import { describe, expect, it } from "vitest";
import type { PrismaService } from "../persistence/prisma/prisma.service.js";
import { seedExternalKey } from "./seed-external-key.js";

/**
 * The script is the only write path for `/external/*` credentials, so the order in which it
 * validates and mints is a correctness property, not an implementation detail. Prisma is faked
 * per test — four calls, no container needed.
 */
describe("seedExternalKey", () => {
  const binding = { ticketTypeCode: "PCT", formId: "form_1", externalFormCode: "CPCT" };

  it("mints a key and its binding when the form belongs to the tenant", async () => {
    const createdKeys: string[] = [];
    let bindings = 0;
    const prisma = {
      tenant: { findUnique: async () => ({ id: "tnt_a" }) },
      formRecord: { findUnique: async () => ({ project: { tenantId: "tnt_a" } }) },
      externalApiKey: {
        create: async () => {
          createdKeys.push("k");
          return { id: "key_1" };
        },
      },
      externalTicketTypeMap: {
        upsert: async () => {
          bindings += 1;
          return { id: "map_1" };
        },
      },
    } as unknown as PrismaService;

    const result = await seedExternalKey(prisma, { tenantId: "tnt_a", label: "ok", binding });

    expect(result.keyId).toBe("key_1");
    expect(result.mapId).toBe("map_1");
    expect(createdKeys).toHaveLength(1);
    expect(bindings).toBe(1);
  });

  // Regression: the first version created the key and *then* validated the binding, so a rejected
  // seed still left an active credential behind. Its raw value was never printed, so nobody could
  // use it — but `--list` showed it as active, which is exactly the row an operator must not have
  // to guess about.
  it.each([
    ["a form in another tenant", "tnt_b"],
    ["a form that does not exist", undefined],
  ])("mints no key when the binding names %s", async (_label, formTenantId) => {
    const createdKeys: string[] = [];
    const prisma = {
      tenant: { findUnique: async () => ({ id: "tnt_a" }) },
      formRecord: {
        findUnique: async () =>
          formTenantId === undefined ? null : { project: { tenantId: formTenantId } },
      },
      externalApiKey: {
        create: async () => {
          createdKeys.push("k");
          return { id: "key_1" };
        },
      },
      externalTicketTypeMap: { upsert: async () => ({ id: "map_1" }) },
    } as unknown as PrismaService;

    await expect(
      seedExternalKey(prisma, { tenantId: "tnt_a", label: "rejected", binding }),
    ).rejects.toThrow();
    expect(createdKeys).toEqual([]);
  });

  it("rejects an unknown tenant before touching anything else", async () => {
    const createdKeys: string[] = [];
    const prisma = {
      tenant: { findUnique: async () => null },
      formRecord: {
        findUnique: async () => {
          throw new Error("must not be reached");
        },
      },
      externalApiKey: {
        create: async () => {
          createdKeys.push("k");
          return { id: "key_1" };
        },
      },
      externalTicketTypeMap: { upsert: async () => ({ id: "map_1" }) },
    } as unknown as PrismaService;

    await expect(
      seedExternalKey(prisma, { tenantId: "nope", label: "x", binding }),
    ).rejects.toThrow("No such tenant: nope");
    expect(createdKeys).toEqual([]);
  });
});
