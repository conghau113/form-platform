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

  type UpsertArgs = { where: unknown; create: unknown; update: unknown };

  /** What the fake below recorded, split by the client each write went through. Both write paths are
   *  split, not just the key: routing *either* of them through the outer client breaks the rollback,
   *  and a fake that shared one recorder between the two would only notice one of the two mistakes. */
  interface Writes {
    /** Keys minted through the transaction client — the only ones a failure can take back. */
    keysInTx: string[];
    /** Keys minted through the outer client. A write here survives a rollback. */
    keysOutsideTx: string[];
    upsertsInTx: UpsertArgs[];
    upsertsOutsideTx: UpsertArgs[];
    /**
     * Every attempt to mint, whichever client it went through, and **never rolled back**.
     *
     * The two lists above model the database, which is what the rollback tests need — but that
     * modelling also swallows the older property that the script validates *before* it mints at all
     * (`seedExternalKey`'s "reject leaves nothing behind"). With only the rollback-aware lists, a
     * version that minted first and validated inside the transaction would look identical from the
     * outside. This list is what still notices.
     */
    keyCreateAttempts: string[];
  }

  /**
   * Fake Prisma that models a transaction well enough to tell the two failure modes apart (P6).
   *
   * The distinction matters more than it looks: writing `prisma.externalApiKey.create()` *inside*
   * the `$transaction` callback still reads as "one transaction" to anyone skimming the code, but
   * the row goes through a different connection and survives the rollback. So the fake records
   * which client each write came from, and discards the transactional ones when the callback
   * throws — the same thing Postgres does, which is proved for real in
   * `modules/external/external-integration.db.test.ts`.
   */
  function fakePrisma(
    opts: {
      onUpsert?: (args: UpsertArgs) => void;
      upsertFails?: boolean;
      formTenantId?: string | null;
    } = {},
  ): { prisma: PrismaService; writes: Writes } {
    const writes: Writes = {
      keysInTx: [],
      keysOutsideTx: [],
      upsertsInTx: [],
      upsertsOutsideTx: [],
      keyCreateAttempts: [],
    };
    const formTenantId = opts.formTenantId === undefined ? "tnt_a" : opts.formTenantId;

    const upsertInto = (sink: UpsertArgs[]) => async (args: UpsertArgs) => {
      if (opts.upsertFails) throw new Error("binding write failed");
      opts.onUpsert?.(args);
      sink.push(args);
      return { id: "map_1" };
    };

    const tx = {
      externalApiKey: {
        create: async () => {
          writes.keysInTx.push("key_1");
          writes.keyCreateAttempts.push("key_1");
          return { id: "key_1" };
        },
      },
      externalTicketTypeMap: { upsert: upsertInto(writes.upsertsInTx) },
    };

    const prisma = {
      tenant: { findUnique: async () => ({ id: "tnt_a" }) },
      formRecord: {
        findUnique: async () =>
          formTenantId === null ? null : { project: { tenantId: formTenantId } },
      },
      externalApiKey: {
        create: async () => {
          writes.keysOutsideTx.push("key_1");
          writes.keyCreateAttempts.push("key_1");
          return { id: "key_1" };
        },
      },
      externalTicketTypeMap: { upsert: upsertInto(writes.upsertsOutsideTx) },
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>): Promise<T> => {
        const keysBefore = writes.keysInTx.length;
        const upsertsBefore = writes.upsertsInTx.length;
        try {
          return await fn(tx);
        } catch (error) {
          writes.keysInTx.length = keysBefore;
          writes.upsertsInTx.length = upsertsBefore;
          throw error;
        }
      },
    } as unknown as PrismaService;

    return { prisma, writes };
  }

  it("mints a key and its binding when the form belongs to the tenant", async () => {
    const { prisma, writes } = fakePrisma();

    const result = await seedExternalKey(prisma, { tenantId: "tnt_a", label: "ok", binding });

    expect(result.keyId).toBe("key_1");
    expect(result.mapId).toBe("map_1");
    expect(writes.keysInTx).toHaveLength(1);
    expect(writes.upsertsInTx).toHaveLength(1);
    // Both writes went through the transaction client, so a failure can undo them together. Routing
    // either one through the outer client would still read as "inside the transaction" in the source
    // while quietly surviving the rollback — hence two separate assertions, not one.
    expect(writes.keysOutsideTx).toEqual([]);
    expect(writes.upsertsOutsideTx).toEqual([]);
  });

  // P6, the advisory left open by D0-a. The validation above cannot rule the binding write out
  // entirely — a constraint the checks do not model, or a connection lost mid-run, gets here.
  it("keeps no key when the binding write fails", async () => {
    const { prisma, writes } = fakePrisma({ upsertFails: true });

    await expect(
      seedExternalKey(prisma, { tenantId: "tnt_a", label: "doomed", binding }),
    ).rejects.toThrow("binding write failed");

    expect(writes.keysInTx).toEqual([]);
    expect(writes.keysOutsideTx).toEqual([]);
  });

  // Regression: the first version created the key and *then* validated the binding, so a rejected
  // seed still left an active credential behind. Its raw value was never printed, so nobody could
  // use it — but `--list` showed it as active, which is exactly the row an operator must not have
  // to guess about.
  it.each([
    ["a form in another tenant", "tnt_b"],
    ["a form that does not exist", null],
  ])("mints no key when the binding names %s", async (_label, formTenantId) => {
    const { prisma, writes } = fakePrisma({ formTenantId });

    await expect(
      seedExternalKey(prisma, { tenantId: "tnt_a", label: "rejected", binding }),
    ).rejects.toThrow();
    expect(writes.keysInTx).toEqual([]);
    expect(writes.keysOutsideTx).toEqual([]);
    // Not "no key survived" — "no key was ever attempted". The transaction would make the first
    // claim true even if the script minted first and validated afterwards, and the order is the
    // property this test was written for.
    expect(writes.keyCreateAttempts).toEqual([]);
  });

  // P2-0. The upsert key decides whether a second `--external-code` *adds* a template or silently
  // overwrites the first, and neither typecheck nor the Testcontainers test pins the script's own
  // choice — the previous fake ignored the argument entirely and would have passed either way.
  it("keys the upsert on all three columns", async () => {
    const wheres: unknown[] = [];
    const { prisma } = fakePrisma({ onUpsert: (args) => wheres.push(args.where) });

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

  // P2b. `--type-name` is optional, so re-running the command to repoint `--form` normally omits it.
  // The script must treat "flag absent" as "leave the stored name alone", not as "set it to null":
  // blanking it makes the next export drop `formTypeName` and emit a warning nobody can trace back
  // to this command, and EVN's `FormType.name` is NOT NULL, so loading a new ticket type then fails.
  // Nothing else pins this — the column is nullable and `ticketTypeName ?? null` typechecks fine.
  it("writes ticketTypeName on update only when the flag was given", async () => {
    const withName: unknown[] = [];
    await seedExternalKey(fakePrisma({ onUpsert: (args) => withName.push(args.update) }).prisma, {
      tenantId: "tnt_a",
      label: "ok",
      binding: { ...binding, ticketTypeName: "Công Tác" },
    });
    expect(withName).toEqual([{ formId: "form_1", workflowId: null, ticketTypeName: "Công Tác" }]);

    const withoutName: Record<string, unknown>[] = [];
    await seedExternalKey(
      fakePrisma({ onUpsert: (args) => withoutName.push(args.update as Record<string, unknown>) })
        .prisma,
      { tenantId: "tnt_a", label: "ok", binding },
    );
    expect(withoutName).toHaveLength(1);
    expect("ticketTypeName" in withoutName[0]).toBe(false);
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
      $transaction: async (fn: (client: unknown) => Promise<unknown>) => {
        throw new Error("must not be reached");
        // biome-ignore lint/correctness/noUnreachable: documents the signature being faked.
        return fn(null);
      },
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
