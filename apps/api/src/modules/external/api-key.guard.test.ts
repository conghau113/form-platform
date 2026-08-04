import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type {
  ExternalApiKeyRecord,
  ExternalTicketTypeMapRecord,
} from "../../persistence/repositories/external-integration.repo.js";
import { ExternalIntegrationRepo } from "../../persistence/repositories/external-integration.repo.js";
import { API_KEY_HEADER, ApiKeyGuard, type ExternalRequest, hashApiKey } from "./api-key.guard.js";

/**
 * In-memory {@link ExternalIntegrationRepo}. `findActiveKeyByHash` filters on `revokedAt` exactly as
 * the Prisma `findFirst` does — a fake that matched on the digest alone would make the "revoked key"
 * test pass for the wrong reason (the guard would look correct while the real query let it through).
 */
class FakeRepo extends ExternalIntegrationRepo {
  readonly keys: ExternalApiKeyRecord[] = [];
  readonly hashes = new Map<string, string>();

  seed(raw: string, key: Omit<ExternalApiKeyRecord, "id"> & { id?: string }): void {
    const row: ExternalApiKeyRecord = { id: key.id ?? `key_${this.keys.length + 1}`, ...key };
    this.keys.push(row);
    this.hashes.set(hashApiKey(raw), row.id);
  }

  async findActiveKeyByHash(tokenHash: string): Promise<ExternalApiKeyRecord | null> {
    const id = this.hashes.get(tokenHash);
    const row = this.keys.find((k) => k.id === id);
    return row && row.revokedAt === null ? row : null;
  }

  async findTicketTypeMap(): Promise<ExternalTicketTypeMapRecord | null> {
    return null;
  }
}

function ctxWith(headers: Record<string, string | string[] | undefined>): {
  ctx: ExecutionContext;
  req: ExternalRequest;
} {
  const req: ExternalRequest = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

describe("ApiKeyGuard", () => {
  it("rejects a request with no key", async () => {
    const guard = new ApiKeyGuard(new FakeRepo());
    const { ctx } = ctxWith({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a blank key without querying", async () => {
    const guard = new ApiKeyGuard(new FakeRepo());
    const { ctx } = ctxWith({ [API_KEY_HEADER]: "   " });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an unknown key", async () => {
    const repo = new FakeRepo();
    repo.seed("good-key", { tenantId: "t1", label: "evn", revokedAt: null });
    const guard = new ApiKeyGuard(repo);
    const { ctx } = ctxWith({ [API_KEY_HEADER]: "wrong-key" });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a revoked key", async () => {
    const repo = new FakeRepo();
    repo.seed("retired-key", { tenantId: "t1", label: "evn", revokedAt: new Date() });
    const guard = new ApiKeyGuard(repo);
    const { ctx } = ctxWith({ [API_KEY_HEADER]: "retired-key" });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("accepts a live key and stamps the tenant on the request", async () => {
    const repo = new FakeRepo();
    repo.seed("good-key", { id: "key_evn", tenantId: "t1", label: "evn", revokedAt: null });
    const guard = new ApiKeyGuard(repo);
    const { ctx, req } = ctxWith({ [API_KEY_HEADER]: "good-key" });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.externalCaller).toEqual({ keyId: "key_evn", tenantId: "t1" });
  });

  it("says the same thing for a wrong key and a revoked key", async () => {
    // This is the pair that must be indistinguishable: telling "revoked" from "never existed" is a
    // probe for whether a tenant ever had an integration. (Deliberately NOT including the
    // no-header case — see the next test for why that one is allowed to differ.)
    const repo = new FakeRepo();
    repo.seed("retired-key", { tenantId: "t1", label: "evn", revokedAt: new Date() });
    const guard = new ApiKeyGuard(repo);

    const messages: string[] = [];
    for (const value of ["wrong-key", "retired-key"]) {
      const { ctx } = ctxWith({ [API_KEY_HEADER]: value });
      await guard.canActivate(ctx).catch((e: Error) => messages.push(e.message));
    }
    expect(messages).toHaveLength(2);
    expect(new Set(messages).size).toBe(1);
  });

  it("distinguishes 'you sent no key' from 'that key is not valid', on purpose", async () => {
    // Pinning the boundary of the property above. "Missing" describes the *request*, not any
    // credential, so it reveals nothing about which keys or tenants exist — and it is the single
    // most useful thing to tell an integrator wiring their client up. Anything past that point
    // collapses to one message.
    const repo = new FakeRepo();
    repo.seed("retired-key", { tenantId: "t1", label: "evn", revokedAt: new Date() });
    const guard = new ApiKeyGuard(repo);

    const missing = await guard.canActivate(ctxWith({}).ctx).catch((e: Error) => e.message);
    const wrong = await guard
      .canActivate(ctxWith({ [API_KEY_HEADER]: "wrong-key" }).ctx)
      .catch((e: Error) => e.message);

    expect(missing).toBe("Missing API key");
    expect(wrong).toBe("Invalid API key");
  });

  it("never stores the raw key — only its digest is queryable", () => {
    // Guards the `RefreshToken` pattern: if someone switched to storing plaintext, the digest
    // would stop being the lookup key and this assertion is what notices.
    const raw = "some-secret";
    expect(hashApiKey(raw)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(raw)).not.toContain(raw);
    expect(hashApiKey(raw)).toBe(hashApiKey(raw));
    expect(hashApiKey(raw)).not.toBe(hashApiKey("some-secre"));
  });
});
