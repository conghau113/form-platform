import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { hashApiKey } from "../modules/external/api-key.guard.js";
import { PrismaService } from "../persistence/prisma/prisma.service.js";

/**
 * Provision an `/external/*` credential and, optionally, one ticket-type binding (EVN §12, D0-a).
 *
 * This script IS the write path. The slice deliberately ships no admin endpoint that could mint a
 * key: an HTTP route would need its own authorization story, and getting that wrong hands out
 * tenant-wide credentials. Seeding out of band keeps the blast radius at "whoever can already run
 * scripts against the database".
 *
 * The raw key is printed once and never stored — only its SHA-256 digest goes to the database, so
 * losing it means issuing a new one, not recovering the old.
 *
 * Usage:
 *   tsx src/scripts/seed-external-key.ts --tenant <tenantId> --label "EVN core-service"
 *     [--ticket-type PCT --form <formId> --external-code CPCT [--workflow <workflowId>]]
 *   tsx src/scripts/seed-external-key.ts --bind-only --tenant <tenantId>
 *     --ticket-type PCT --form <formId> --external-code CT_PCT_PDF [--workflow <workflowId>]
 *     ⚠️ Binding a SECOND template for a ticket type requires every instance to be running the
 *     P2-0 build. An older one queries by two columns and will silently serve whichever row
 *     Postgres yields first. See the header of the `..._external_binding_per_form_code` migration.
 *   tsx src/scripts/seed-external-key.ts --list <tenantId>
 *   tsx src/scripts/seed-external-key.ts --revoke <keyId>
 *   tsx src/scripts/seed-external-key.ts --unbind <mapId>
 *
 * A ticket type may be bound more than once — EVN's `PCT` is backed by six templates (P2-0) — so
 * binding is `--bind-only` rather than a side effect of issuing a credential. Minting a key per
 * template would leave six live secrets where one was wanted.
 *
 * `--revoke` and `--unbind` live here rather than in a separate file because the moment you need
 * them, you need them immediately: an issuing tool with no matching kill switch means reaching for
 * hand-written SQL during the one incident where mistakes are most expensive. `--unbind` earns its
 * place because a mistyped `--external-code` no longer overwrites the previous row — it adds one,
 * and the extra row makes a bare `?ticketTypeCode=` call ambiguous, which the endpoint answers with
 * an opaque 404. `--list` prints bindings for the same reason: that 404 is unreadable from outside.
 */
/** One caller-side ticket type + template, pointed at one of our forms. */
export interface ExternalBinding {
  ticketTypeCode: string;
  formId: string;
  externalFormCode: string;
  workflowId?: string | null;
}

export interface SeedExternalKeyOptions {
  tenantId: string;
  label: string;
  binding?: ExternalBinding;
}

export interface SeedExternalKeyResult {
  /** Show this to the operator once; it is unrecoverable afterwards. */
  rawKey: string;
  keyId: string;
  mapId?: string;
}

/** Fail loudly on an unknown tenant rather than letting the FK do it: the cascade message would not
 *  say which of the two ids was wrong. */
async function assertTenantExists(prisma: PrismaService, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error(`No such tenant: ${tenantId}`);
}

/** The service re-checks this on every read, but a binding that can never resolve is a seeding
 *  mistake worth catching here rather than as a mysterious 404 later. */
async function assertBindableForm(
  prisma: PrismaService,
  tenantId: string,
  formId: string,
): Promise<void> {
  const form = await prisma.formRecord.findUnique({
    where: { id: formId },
    select: { project: { select: { tenantId: true } } },
  });
  if (!form) throw new Error(`No such form: ${formId}`);
  if (form.project.tenantId !== tenantId) {
    throw new Error(`Form ${formId} belongs to another tenant — refusing to bind it`);
  }
}

async function upsertBinding(
  prisma: PrismaService,
  tenantId: string,
  binding: ExternalBinding,
): Promise<string> {
  const { ticketTypeCode, formId, externalFormCode, workflowId } = binding;
  // Keyed on all three columns since P2-0: re-running with the same `--external-code` updates that
  // binding, while a different one adds a second template for the same ticket type instead of
  // overwriting the first. `externalFormCode` is not in `update:` — it is part of the key, so it
  // can only ever equal itself.
  const map = await prisma.externalTicketTypeMap.upsert({
    where: {
      tenantId_ticketTypeCode_externalFormCode: { tenantId, ticketTypeCode, externalFormCode },
    },
    create: {
      tenantId,
      ticketTypeCode,
      formId,
      externalFormCode,
      workflowId: workflowId ?? null,
    },
    update: { formId, workflowId: workflowId ?? null },
    select: { id: true },
  });
  return map.id;
}

/** Bind a template without issuing a credential — the path for the second through sixth template of
 *  a ticket type, where minting another key would only create secrets nobody asked for. */
export async function bindTicketType(
  prisma: PrismaService,
  tenantId: string,
  binding: ExternalBinding,
): Promise<string> {
  await assertTenantExists(prisma, tenantId);
  await assertBindableForm(prisma, tenantId, binding.formId);
  return upsertBinding(prisma, tenantId, binding);
}

/**
 * Remove one binding. The row carries no secret, so unlike `--revoke` this deletes rather than
 * tombstones — a mistyped `--external-code` should leave nothing behind.
 *
 * It returns what it deleted so the caller can print it: nothing audits this script, and an unbind
 * of the wrong id would otherwise be unrecoverable guesswork. `workflowId` is in there for the same
 * reason — see the warning on that column in `schema.prisma`.
 */
export async function unbindTicketType(
  prisma: PrismaService,
  mapId: string,
): Promise<ExternalBinding> {
  const row = await prisma.externalTicketTypeMap.findUnique({
    where: { id: mapId },
    select: { ticketTypeCode: true, formId: true, externalFormCode: true, workflowId: true },
  });
  if (!row) throw new Error(`No such binding: ${mapId}`);
  await prisma.externalTicketTypeMap.delete({ where: { id: mapId } });
  return row;
}

export async function seedExternalKey(
  prisma: PrismaService,
  options: SeedExternalKeyOptions,
): Promise<SeedExternalKeyResult> {
  await assertTenantExists(prisma, options.tenantId);

  // Validate the binding before minting anything. Rejecting afterwards would leave behind a live
  // credential whose raw value was never printed — unusable, but indistinguishable from a real key
  // in `--list`, so an operator cleaning up cannot tell which rows are safe to revoke.
  if (options.binding) {
    await assertBindableForm(prisma, options.tenantId, options.binding.formId);
  }

  const rawKey = randomBytes(32).toString("base64url");
  const key = await prisma.externalApiKey.create({
    data: {
      tenantId: options.tenantId,
      label: options.label,
      tokenHash: hashApiKey(rawKey),
    },
    select: { id: true },
  });

  const mapId = options.binding
    ? await upsertBinding(prisma, options.tenantId, options.binding)
    : undefined;

  return { rawKey, keyId: key.id, mapId };
}

/** Revoke one key. Idempotent, and it keeps the row so the audit trail still resolves the actor. */
export async function revokeExternalKey(prisma: PrismaService, keyId: string): Promise<void> {
  const updated = await prisma.externalApiKey.updateMany({
    where: { id: keyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 0) {
    // Distinguish the two so an operator under pressure knows whether to keep looking.
    const exists = await prisma.externalApiKey.findUnique({ where: { id: keyId } });
    throw new Error(exists ? `Key ${keyId} was already revoked` : `No such key: ${keyId}`);
  }
}

/**
 * Minimal `--flag value` reader — this runs by hand, not in a pipeline.
 *
 * A missing value reads as absent rather than swallowing the next flag. Since P2-0 that is not
 * cosmetic: `--external-code --bind-only` used to write a garbage code over the tenant's single
 * row, which was at least self-limiting, but now *adds* a row and quietly flips a working
 * `?ticketTypeCode=` integration into the ambiguous 404.
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/** Both halves, because the ambiguous-binding 404 is unreadable from the outside: an operator whose
 *  integrator reports "Unknown ticket type" needs to see that PCT is bound twice. */
async function printTenant(prisma: PrismaService, tenantId: string): Promise<void> {
  const [keys, bindings] = await Promise.all([
    prisma.externalApiKey.findMany({
      where: { tenantId },
      select: { id: true, label: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.externalTicketTypeMap.findMany({
      where: { tenantId },
      select: { id: true, ticketTypeCode: true, externalFormCode: true, formId: true },
      orderBy: [{ ticketTypeCode: "asc" }, { externalFormCode: "asc" }],
    }),
  ]);
  const lines = [
    "keys:",
    ...(keys.length === 0
      ? ["  (none)"]
      : keys.map(
          (k) =>
            `  ${k.id}  ${k.revokedAt ? "REVOKED" : "active "}  ${k.createdAt.toISOString()}  ${k.label}`,
        )),
    "bindings:",
    ...(bindings.length === 0
      ? ["  (none)"]
      : bindings.map(
          (b) => `  ${b.id}  ${b.ticketTypeCode}/${b.externalFormCode}  -> ${b.formId}`,
        )),
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  const revokeId = arg("revoke");
  const unbindId = arg("unbind");
  const listTenant = arg("list");
  if (revokeId || unbindId || listTenant) {
    const prisma = new PrismaService();
    await prisma.$connect();
    try {
      if (revokeId) {
        await revokeExternalKey(prisma, revokeId);
        // eslint-disable-next-line no-console
        console.log(`revoked: ${revokeId}`);
        return;
      }
      if (unbindId) {
        const gone = await unbindTicketType(prisma, unbindId);
        // Printed so a wrong-id unbind is one copy-paste away from being re-bound.
        // eslint-disable-next-line no-console
        console.log(
          `unbound: ${unbindId}\n  --ticket-type ${gone.ticketTypeCode} --form ${gone.formId} ` +
            `--external-code ${gone.externalFormCode}` +
            (gone.workflowId ? ` --workflow ${gone.workflowId}` : ""),
        );
        return;
      }
      await printTenant(prisma, listTenant as string);
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  const tenantId = arg("tenant");
  const bindOnly = process.argv.includes("--bind-only");
  const label = arg("label");
  if (!tenantId) throw new Error("Required: --tenant <tenantId>");

  const ticketTypeCode = arg("ticket-type");
  const formId = arg("form");
  const externalFormCode = arg("external-code");
  if (ticketTypeCode && !(formId && externalFormCode)) {
    throw new Error("--ticket-type also needs --form and --external-code");
  }

  if (bindOnly) {
    if (!(ticketTypeCode && formId && externalFormCode)) {
      throw new Error("--bind-only needs --ticket-type, --form and --external-code");
    }
    const prisma = new PrismaService();
    await prisma.$connect();
    try {
      const mapId = await bindTicketType(prisma, tenantId, {
        ticketTypeCode,
        formId,
        externalFormCode,
        workflowId: arg("workflow") ?? null,
      });
      // eslint-disable-next-line no-console
      console.log(`binding: ${mapId}  (no key issued)`);
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  if (!label) {
    throw new Error('Required: --label "<name>", or --bind-only to add a binding without a key');
  }

  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await seedExternalKey(prisma, {
      tenantId,
      label,
      binding:
        ticketTypeCode && formId && externalFormCode
          ? { ticketTypeCode, formId, externalFormCode, workflowId: arg("workflow") ?? null }
          : undefined,
    });
    // eslint-disable-next-line no-console
    console.log(
      [
        `key id : ${result.keyId}`,
        result.mapId ? `binding: ${result.mapId}` : "binding: (none)",
        "",
        "API key (shown once — it is stored only as a SHA-256 digest):",
        result.rawKey,
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
