import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_OWNER_ID } from "../../common/constants.js";
import {
  type RefreshTokenRecord,
  RefreshTokenRepo,
} from "../../persistence/repositories/refresh-token.repo.js";
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import { type UserRecord, UserRepo } from "../../persistence/repositories/user.repo.js";
import { AuthService } from "./auth.service.js";

let seq = 0;

/** In-memory UserRepo — mirrors the Prisma unique constraints on `email` and `id`. */
class FakeUserRepo extends UserRepo {
  readonly rows: UserRecord[] = [];

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.rows.find((r) => r.email === email) ?? null;
  }
  async findById(id: string): Promise<UserRecord | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(input: {
    id?: string;
    email: string;
    passwordHash: string;
    displayName?: string | null;
  }): Promise<UserRecord> {
    if (this.rows.some((r) => r.email === input.email)) throw new Error("unique email");
    const id = input.id ?? `u${++seq}`;
    if (this.rows.some((r) => r.id === id)) throw new Error("unique id");
    const row: UserRecord = {
      id,
      email: input.email,
      passwordHash: input.passwordHash,
      displayName: input.displayName ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
}

/** In-memory RefreshTokenRepo — mirrors the Prisma unique `tokenHash` + revoke semantics. */
class FakeRefreshTokenRepo extends RefreshTokenRepo {
  readonly rows: RefreshTokenRecord[] = [];

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord> {
    if (this.rows.some((r) => r.tokenHash === input.tokenHash)) throw new Error("unique tokenHash");
    const row: RefreshTokenRecord = {
      id: `rt${++seq}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }
  async revoke(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.revokedAt = new Date();
  }
  async revokeAllForUser(userId: string): Promise<void> {
    for (const r of this.rows) if (r.userId === userId && !r.revokedAt) r.revokedAt = new Date();
  }
}

/** In-memory TenantRepo — one personal tenant per owner + a membership per user, idempotent like the
 *  Prisma impl (tenant keyed by owner id; membership only on the personal-tenant path). */
class FakeTenantRepo extends TenantRepo {
  readonly tenants = new Map<string, string>(); // ownerId -> tenantId
  readonly memberships: { userId: string; tenantId: string }[] = [];

  async ensureTenantForOwner(ownerId: string): Promise<string> {
    const existing = this.tenants.get(ownerId);
    if (existing) return existing;
    const tenantId = `t${++seq}`;
    this.tenants.set(ownerId, tenantId);
    return tenantId;
  }

  async findTenantIdForUser(userId: string): Promise<string | null> {
    return this.tenants.get(userId) ?? null;
  }

  async ensurePersonalTenant(userId: string): Promise<string> {
    const tenantId = await this.ensureTenantForOwner(userId);
    if (!this.memberships.some((m) => m.userId === userId && m.tenantId === tenantId)) {
      this.memberships.push({ userId, tenantId });
    }
    return tenantId;
  }
}

describe("AuthService", () => {
  const jwt = new JwtService({
    secret: "test-secret-at-least-16-chars",
    signOptions: { expiresIn: "1h" },
  });
  let users: FakeUserRepo;
  let refreshTokens: FakeRefreshTokenRepo;
  let tenants: FakeTenantRepo;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUserRepo();
    refreshTokens = new FakeRefreshTokenRepo();
    tenants = new FakeTenantRepo();
    service = new AuthService(users, jwt, refreshTokens, tenants);
  });

  afterEach(() => {
    delete process.env.AUTH_BOOTSTRAP_EMAIL;
    delete process.env.AUTH_BOOTSTRAP_PASSWORD;
  });

  it("registers a user: hashes the password, returns a verifiable token + password-free profile", async () => {
    const res = await service.register("Alice@Example.com ", "supersecret", " Alice ");

    // Profile is safe (no hash) and email is normalized.
    expect(res.user.email).toBe("alice@example.com");
    expect(res.user.displayName).toBe("Alice");
    expect((res.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

    // Password is stored hashed, not in plaintext.
    const stored = users.rows[0];
    expect(stored.passwordHash).not.toBe("supersecret");
    expect(await bcrypt.compare("supersecret", stored.passwordHash)).toBe(true);

    // Access token carries sub = user id.
    const payload = await jwt.verifyAsync<{ sub: string; email: string }>(res.accessToken);
    expect(payload.sub).toBe(res.user.id);
    expect(payload.email).toBe("alice@example.com");

    // A refresh token is issued and stored hashed (never in plaintext).
    expect(res.refreshToken).toBeTruthy();
    expect(refreshTokens.rows).toHaveLength(1);
    expect(refreshTokens.rows[0].tokenHash).not.toBe(res.refreshToken);
    expect(refreshTokens.rows[0].userId).toBe(res.user.id);
  });

  it("auto-provisions a personal tenant on register and reuses it on later login (B1)", async () => {
    const reg = await service.register("tina@example.com", "password1");
    expect(tenants.memberships).toHaveLength(1);
    expect(tenants.memberships[0].userId).toBe(reg.user.id);

    // Login for the same user does not create a second tenant (ensurePersonalTenant is idempotent).
    await service.login("tina@example.com", "password1");
    expect(tenants.memberships.filter((m) => m.userId === reg.user.id)).toHaveLength(1);
  });

  it("rejects a duplicate email", async () => {
    await service.register("bob@example.com", "password1");
    await expect(service.register("BOB@example.com", "password2")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("logs in with correct credentials (email case-insensitive)", async () => {
    await service.register("carol@example.com", "hunter2pass");
    const res = await service.login("Carol@Example.com", "hunter2pass");
    expect(res.user.email).toBe("carol@example.com");
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toBeTruthy();
  });

  it("rejects a wrong password and an unknown email with the same generic error", async () => {
    await service.register("dave@example.com", "correctpass");
    await expect(service.login("dave@example.com", "wrongpass")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.login("nobody@example.com", "whatever1")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("me() returns the profile for an existing user and rejects a stale id", async () => {
    const { user } = await service.register("erin@example.com", "password1");
    expect((await service.me(user.id)).email).toBe("erin@example.com");
    await expect(service.me("ghost")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe("refresh tokens (A1)", () => {
    it("rotates: issues a new pair, revokes the old token, and keeps the new one usable", async () => {
      const first = await service.register("frank@example.com", "password1");
      const second = await service.refresh(first.refreshToken);

      // A fresh, different refresh token was issued...
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.user.id).toBe(first.user.id);
      // ...the old row is revoked, the new one is live.
      expect(refreshTokens.rows).toHaveLength(2);
      expect(refreshTokens.rows[0].revokedAt).not.toBeNull();
      expect(refreshTokens.rows[1].revokedAt).toBeNull();

      // The new token refreshes again; the old one is now spent (see reuse test).
      const third = await service.refresh(second.refreshToken);
      expect(third.refreshToken).toBeTruthy();
    });

    it("rejects an unknown token", async () => {
      await expect(service.refresh("not-a-real-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("detects reuse: replaying a rotated token revokes every session for that user", async () => {
      const first = await service.register("grace@example.com", "password1");
      const second = await service.refresh(first.refreshToken); // rotates → first now revoked

      // Replaying the already-rotated token is treated as theft.
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // ...and nukes the whole family, so even the legitimate current token is now dead.
      await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokens.rows.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it("rejects an expired token", async () => {
      const res = await service.register("heidi@example.com", "password1");
      // Force the just-issued token to be already expired.
      refreshTokens.rows[0].expiresAt = new Date(Date.now() - 1000);
      await expect(service.refresh(res.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("logout revokes the presented token; logout-all revokes every session", async () => {
      const a = await service.register("ivan@example.com", "password1");
      const b = await service.refresh(a.refreshToken); // second live session (a revoked)

      await service.logout(b.refreshToken);
      expect(refreshTokens.rows.every((r) => r.revokedAt !== null)).toBe(true);
      // A revoked token can no longer refresh.
      await expect(service.refresh(b.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

      // logout-all is a no-op-safe sweep over all of a user's tokens.
      const c = await service.login("ivan@example.com", "password1");
      await service.logoutAll(c.user.id);
      await expect(service.refresh(c.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("logout is a no-op when no token is presented", async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
    });
  });

  describe("bootstrap admin", () => {
    it("seeds an admin with id=SEED_OWNER_ID when configured and absent", async () => {
      process.env.AUTH_BOOTSTRAP_EMAIL = "Admin@Corp.com";
      process.env.AUTH_BOOTSTRAP_PASSWORD = "adminpass1";
      await service.onModuleInit();
      const admin = await users.findById(SEED_OWNER_ID);
      expect(admin?.email).toBe("admin@corp.com");
      // The seeded admin can log in.
      const res = await service.login("admin@corp.com", "adminpass1");
      expect(res.user.id).toBe(SEED_OWNER_ID);
    });

    it("is idempotent and skips when creds are absent", async () => {
      process.env.AUTH_BOOTSTRAP_EMAIL = "admin@corp.com";
      process.env.AUTH_BOOTSTRAP_PASSWORD = "adminpass1";
      await service.onModuleInit();
      await service.onModuleInit(); // second boot must not duplicate
      expect(users.rows.filter((r) => r.id === SEED_OWNER_ID)).toHaveLength(1);

      // No creds → no seeding.
      delete process.env.AUTH_BOOTSTRAP_EMAIL;
      delete process.env.AUTH_BOOTSTRAP_PASSWORD;
      const users2 = new FakeUserRepo();
      await new AuthService(
        users2,
        jwt,
        new FakeRefreshTokenRepo(),
        new FakeTenantRepo(),
      ).onModuleInit();
      expect(users2.rows).toHaveLength(0);
    });
  });
});
