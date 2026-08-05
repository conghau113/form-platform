import { describe, expect, it } from "vitest";
import type { PrismaService } from "../persistence/prisma/prisma.service.js";
import { bindTicketType, seedExternalKey, unbindTicketType } from "./seed-external-key.js";

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

  // P2-0. The upsert key decides whether a second `--external-code` *adds* a template or silently
  // overwrites the first, and neither typecheck nor the Testcontainers test pins the script's own
  // choice — the previous fake ignored the argument entirely and would have passed either way.
  it("keys the upsert on all three columns", async () => {
    const wheres: unknown[] = [];
    const prisma = {
      tenant: { findUnique: async () => ({ id: "tnt_a" }) },
      formRecord: { findUnique: async () => ({ project: { tenantId: "tnt_a" } }) },
      externalApiKey: { create: async () => ({ id: "key_1" }) },
      externalTicketTypeMap: {
        upsert: async ({ where }: { where: unknown }) => {
          wheres.push(where);
          return { id: "map_1" };
        },
      },
    } as unknown as PrismaService;

    await seedExternalKey(prisma, { tenantId: "tnt_a", label: "ok", binding });

    expect(wheres).toEqual([
      {
        tenantId_ticketTypeCode_externalFormCode: {
          tenantId: "tnt_a",
          ticketTypeCode: "PCT",
          externalFormCode: "CPCT",
        },
      },
    ]);
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

/**
 * Binding without issuing a credential. Widening the key made this necessary rather than nice to
 * have: a ticket type with six templates would otherwise cost six live API keys, one per binding.
 */
describe("bindTicketType", () => {
  const binding = { ticketTypeCode: "PCT", formId: "form_1", externalFormCode: "CT_PCT_PDF" };

  it("adds the binding and mints no key", async () => {
    const createdKeys: string[] = [];
    const prisma = {
      tenant: { findUnique: async () => ({ id: "tnt_a" }) },
      formRecord: { findUnique: async () => ({ project: { tenantId: "tnt_a" } }) },
      externalApiKey: {
        create: async () => {
          createdKeys.push("k");
          return { id: "key_1" };
        },
      },
      externalTicketTypeMap: { upsert: async () => ({ id: "map_2" }) },
    } as unknown as PrismaService;

    expect(await bindTicketType(prisma, "tnt_a", binding)).toBe("map_2");
    expect(createdKeys).toEqual([]);
  });

  it("refuses a form belonging to another tenant", async () => {
    // Same check as the key path — a binding that can never resolve would surface later as the
    // endpoint's opaque 404.
    const prisma = {
      tenant: { findUnique: async () => ({ id: "tnt_a" }) },
      formRecord: { findUnique: async () => ({ project: { tenantId: "tnt_b" } }) },
      externalTicketTypeMap: {
        upsert: async () => {
          throw new Error("must not be reached");
        },
      },
    } as unknown as PrismaService;

    await expect(bindTicketType(prisma, "tnt_a", binding)).rejects.toThrow("another tenant");
  });
});

describe("unbindTicketType", () => {
  const row = {
    ticketTypeCode: "PCT",
    formId: "form_1",
    externalFormCode: "CT_PCT_PDF",
    workflowId: null,
  };

  it("says so when the binding is not there, rather than reporting success", async () => {
    // The one command an operator reaches for after a typo — a silent no-op would leave them
    // believing the ambiguous binding is gone.
    const deletes: unknown[] = [];
    const prisma = {
      externalTicketTypeMap: {
        findUnique: async () => null,
        delete: async ({ where }: { where: unknown }) => {
          deletes.push(where);
          return row;
        },
      },
    } as unknown as PrismaService;
    await expect(unbindTicketType(prisma, "map_missing")).rejects.toThrow("No such binding");
    expect(deletes).toEqual([]);
  });

  it("returns what it deleted, so a wrong id can be re-bound", async () => {
    // Nothing audits this script; the returned row is the only record that the binding existed.
    const deletes: unknown[] = [];
    const prisma = {
      externalTicketTypeMap: {
        findUnique: async () => row,
        delete: async ({ where }: { where: unknown }) => {
          deletes.push(where);
          return row;
        },
      },
    } as unknown as PrismaService;
    await expect(unbindTicketType(prisma, "map_1")).resolves.toEqual(row);
    expect(deletes).toEqual([{ id: "map_1" }]);
  });
});
