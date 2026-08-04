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
 *   tsx src/scripts/seed-external-key.ts --list <tenantId>
 *   tsx src/scripts/seed-external-key.ts --revoke <keyId>
 *
 * `--revoke` lives here rather than in a separate file because the moment you need it, you need it
 * immediately: an issuing tool with no matching kill switch means reaching for hand-written SQL
 * during the one incident where mistakes are most expensive.
 */
export interface SeedExternalKeyOptions {
  tenantId: string;
  label: string;
  binding?: {
    ticketTypeCode: string;
    formId: string;
    externalFormCode: string;
    workflowId?: string | null;
  };
}

export interface SeedExternalKeyResult {
  /** Show this to the operator once; it is unrecoverable afterwards. */
  rawKey: string;
  keyId: string;
  mapId?: string;
}

export async function seedExternalKey(
  prisma: PrismaService,
  options: SeedExternalKeyOptions,
): Promise<SeedExternalKeyResult> {
  // Fail loudly on an unknown tenant rather than letting the FK do it: the cascade message would
  // not say which of the two ids was wrong.
  const tenant = await prisma.tenant.findUnique({ where: { id: options.tenantId } });
  if (!tenant) throw new Error(`No such tenant: ${options.tenantId}`);

  // Validate the binding before minting anything. Rejecting afterwards would leave behind a live
  // credential whose raw value was never printed — unusable, but indistinguishable from a real key
  // in `--list`, so an operator cleaning up cannot tell which rows are safe to revoke.
  if (options.binding) {
    const { formId } = options.binding;
    const form = await prisma.formRecord.findUnique({
      where: { id: formId },
      select: { project: { select: { tenantId: true } } },
    });
    if (!form) throw new Error(`No such form: ${formId}`);
    // The service re-checks this on every read, but a binding that can never resolve is a seeding
    // mistake worth catching here rather than as a mysterious 404 later.
    if (form.project.tenantId !== options.tenantId) {
      throw new Error(`Form ${formId} belongs to another tenant — refusing to bind it`);
    }
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

  let mapId: string | undefined;
  if (options.binding) {
    const { ticketTypeCode, formId, externalFormCode, workflowId } = options.binding;
    const map = await prisma.externalTicketTypeMap.upsert({
      where: { tenantId_ticketTypeCode: { tenantId: options.tenantId, ticketTypeCode } },
      create: {
        tenantId: options.tenantId,
        ticketTypeCode,
        formId,
        externalFormCode,
        workflowId: workflowId ?? null,
      },
      update: { formId, externalFormCode, workflowId: workflowId ?? null },
      select: { id: true },
    });
    mapId = map.id;
  }

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

/** Minimal `--flag value` reader — this runs by hand, not in a pipeline. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(): Promise<void> {
  const revokeId = arg("revoke");
  const listTenant = arg("list");
  if (revokeId || listTenant) {
    const prisma = new PrismaService();
    await prisma.$connect();
    try {
      if (revokeId) {
        await revokeExternalKey(prisma, revokeId);
        // eslint-disable-next-line no-console
        console.log(`revoked: ${revokeId}`);
        return;
      }
      const keys = await prisma.externalApiKey.findMany({
        where: { tenantId: listTenant },
        select: { id: true, label: true, revokedAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      // eslint-disable-next-line no-console
      console.log(
        keys.length === 0
          ? "(no keys)"
          : keys
              .map(
                (k) =>
                  `${k.id}  ${k.revokedAt ? "REVOKED" : "active "}  ${k.createdAt.toISOString()}  ${k.label}`,
              )
              .join("\n"),
      );
      return;
    } finally {
      await prisma.$disconnect();
    }
  }

  const tenantId = arg("tenant");
  const label = arg("label");
  if (!tenantId || !label) {
    throw new Error('Required: --tenant <tenantId> --label "<name>"');
  }

  const ticketTypeCode = arg("ticket-type");
  const formId = arg("form");
  const externalFormCode = arg("external-code");
  if (ticketTypeCode && !(formId && externalFormCode)) {
    throw new Error("--ticket-type also needs --form and --external-code");
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
