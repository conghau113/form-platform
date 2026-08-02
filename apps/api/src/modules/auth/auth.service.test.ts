import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_OWNER_ID } from "../../common/constants.js";
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
import {
  type RefreshTokenRecord,
  RefreshTokenRepo,
} from "../../persistence/repositories/refresh-token.repo.js";
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import { type UserRecord, UserRepo } from "../../persistence/repositories/user.repo.js";
import {
  type TokenPurpose,
  type VerificationTokenRecord,
  VerificationTokenRepo,
} from "../../persistence/repositories/verification-token.repo.js";
import { MailService } from "../mail/mail.service.js";
import type { MailContent } from "../mail/mail-templates.js";
import { AuthService } from "./auth.service.js";
import { GOOGLE_TOKEN_ENDPOINT } from "./google-oauth.js";

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
    passwordHash?: string | null;
    displayName?: string | null;
  }): Promise<UserRecord> {
    if (this.rows.some((r) => r.email === input.email)) throw new Error("unique email");
    const id = input.id ?? `u${++seq}`;
    if (this.rows.some((r) => r.id === id)) throw new Error("unique id");
    const row: UserRecord = {
      id,
      email: input.email,
      passwordHash: input.passwordHash ?? null,
      displayName: input.displayName ?? null,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async updatePassword(id: string, passwordHash: string | null): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.passwordHash = passwordHash;
  }
  async markEmailVerified(id: string): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.emailVerifiedAt = new Date();
  }
}

/** In-memory VerificationTokenRepo — mirrors the unique `tokenHash` + single-use semantics. */
class FakeVerificationTokenRepo extends VerificationTokenRepo {
  readonly rows: VerificationTokenRecord[] = [];

  async create(input: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord> {
    if (this.rows.some((r) => r.tokenHash === input.tokenHash)) throw new Error("unique tokenHash");
    const row: VerificationTokenRecord = {
      id: `vt${++seq}`,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async findByHash(tokenHash: string): Promise<VerificationTokenRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }
  async consume(id: string): Promise<boolean> {
    // Mirrors the Prisma compare-and-set: only the first claim of a token wins.
    const row = this.rows.find((r) => r.id === id);
    if (!row || row.consumedAt) return false;
    row.consumedAt = new Date();
    return true;
  }
  async invalidateActive(userId: string, purpose: TokenPurpose): Promise<void> {
    for (const r of this.rows) {
      if (r.userId === userId && r.purpose === purpose && !r.consumedAt) r.consumedAt = new Date();
    }
  }
}

/** Captures outgoing mail instead of sending it (the real service also has a no-SMTP log mode). */
class FakeMailService extends MailService {
  readonly sent: { to: string; subject: string; text: string }[] = [];
  constructor() {
    super({ get: () => undefined } as unknown as ConfigService);
  }
  override async send(to: string, content: MailContent): Promise<void> {
    this.sent.push({ to, subject: content.subject, text: content.text });
  }
  /** The token embedded in the most recent link we "sent". */
  lastToken(): string {
    const match = /token=([a-f0-9]+)/.exec(this.sent.at(-1)?.text ?? "");
    if (!match) throw new Error("no token in the last mail");
    return match[1];
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

  async listTenantIdsForUser(userId: string): Promise<string[]> {
    const tenantId = this.tenants.get(userId);
    return tenantId ? [tenantId] : [];
  }
  async listTenantsForUser(): Promise<never> {
    throw new Error("not used");
  }

  async isMember(userId: string, tenantId: string): Promise<boolean> {
    return this.memberships.some((m) => m.userId === userId && m.tenantId === tenantId);
  }

  async addMember(tenantId: string, userId: string): Promise<void> {
    if (!(await this.isMember(userId, tenantId))) this.memberships.push({ userId, tenantId });
  }

  async ensurePersonalTenant(userId: string): Promise<string> {
    const tenantId = await this.ensureTenantForOwner(userId);
    if (!this.memberships.some((m) => m.userId === userId && m.tenantId === tenantId)) {
      this.memberships.push({ userId, tenantId });
    }
    return tenantId;
  }
}

/** In-memory RbacRepo — records tenant-admin provisioning; the rest are unused no-op stubs here. */
class FakeRbacRepo extends RbacRepo {
  readonly admins: { userId: string; tenantId: string }[] = [];
  async ensureTenantAdmin(userId: string, tenantId: string): Promise<void> {
    if (!this.admins.some((a) => a.userId === userId && a.tenantId === tenantId)) {
      this.admins.push({ userId, tenantId });
    }
  }
  async seedFunctions(): Promise<void> {}
  async listFunctions(): Promise<never[]> {
    return [];
  }
  async createRole(): Promise<never> {
    throw new Error("not used");
  }
  async listRoles(): Promise<never[]> {
    return [];
  }
  async findRoleById(): Promise<null> {
    return null;
  }
  async updateRole(): Promise<never> {
    throw new Error("not used");
  }
  async deleteRole(): Promise<void> {}
  async setRoleFunctions(): Promise<void> {}
  async listRoleFunctions(): Promise<never[]> {
    return [];
  }
  async setRoleDataScopes(): Promise<void> {}
  async listRoleDataScopes(): Promise<never[]> {
    return [];
  }
  async listTenantUsers(): Promise<never[]> {
    return [];
  }
  async setUserRoles(): Promise<void> {}
  async listUserRoleIds(): Promise<never[]> {
    return [];
  }
  async listUserRoleNames(): Promise<never[]> {
    return [];
  }
  async resolveFunctions(): Promise<never[]> {
    return [];
  }
  async resolveScopedGrants(): Promise<never[]> {
    return [];
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
  let rbac: FakeRbacRepo;
  let verificationTokens: FakeVerificationTokenRepo;
  let mail: FakeMailService;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUserRepo();
    refreshTokens = new FakeRefreshTokenRepo();
    tenants = new FakeTenantRepo();
    rbac = new FakeRbacRepo();
    verificationTokens = new FakeVerificationTokenRepo();
    mail = new FakeMailService();
    service = new AuthService(users, jwt, refreshTokens, tenants, rbac, verificationTokens, mail);
  });

  afterEach(() => {
    delete process.env.AUTH_BOOTSTRAP_EMAIL;
    delete process.env.AUTH_BOOTSTRAP_PASSWORD;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
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
    expect(await bcrypt.compare("supersecret", stored.passwordHash ?? "")).toBe(true);

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

  it("auto-provisions the tenant owner as admin on register (Phase C)", async () => {
    const reg = await service.register("carla@example.com", "password1");
    const tenantId = await tenants.findTenantIdForUser(reg.user.id);
    expect(rbac.admins).toContainEqual({ userId: reg.user.id, tenantId });
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

  describe("email verification (A2)", () => {
    it("emails a verification link on register and stamps emailVerifiedAt when redeemed", async () => {
      const reg = await service.register("nina@example.com", "password1", "Nina");
      expect(reg.user.emailVerifiedAt).toBeNull();
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe("nina@example.com");
      // Only the hash is stored — the raw token exists solely in the emailed link.
      expect(verificationTokens.rows).toHaveLength(1);
      expect(verificationTokens.rows[0].tokenHash).not.toBe(mail.lastToken());

      await service.verifyEmail(mail.lastToken());
      expect((await service.me(reg.user.id)).emailVerifiedAt).not.toBeNull();
      expect(verificationTokens.rows[0].consumedAt).not.toBeNull();
    });

    it("rejects a replayed, unknown, expired or wrong-purpose token", async () => {
      await service.register("otto@example.com", "password1");
      const token = mail.lastToken();
      await service.verifyEmail(token);

      // Replay of a consumed token.
      await expect(service.verifyEmail(token)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.verifyEmail("deadbeef")).rejects.toBeInstanceOf(BadRequestException);

      // A verification token must not double as a reset token (purpose is checked).
      await service.register("pam@example.com", "password1");
      await expect(service.resetPassword(mail.lastToken(), "brandnewpass")).rejects.toBeInstanceOf(
        BadRequestException,
      );

      // Expired.
      verificationTokens.rows[verificationTokens.rows.length - 1].expiresAt = new Date(
        Date.now() - 1000,
      );
      await expect(service.verifyEmail(mail.lastToken())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("lets only one of two concurrent redemptions win (compare-and-set consume)", async () => {
      await service.register("tess@example.com", "password1");
      const token = mail.lastToken();

      const results = await Promise.allSettled([
        service.verifyEmail(token),
        service.verifyEmail(token),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });

    it("resend issues a fresh token, kills the previous one, and is a no-op once verified", async () => {
      const reg = await service.register("quinn@example.com", "password1");
      const first = mail.lastToken();

      await service.resendVerification(reg.user.id);
      const second = mail.lastToken();
      expect(second).not.toBe(first);
      // The superseded link no longer works; the newest one does.
      await expect(service.verifyEmail(first)).rejects.toBeInstanceOf(BadRequestException);
      await service.verifyEmail(second);

      const before = mail.sent.length;
      await service.resendVerification(reg.user.id);
      expect(mail.sent).toHaveLength(before);
    });
  });

  describe("password reset (A2)", () => {
    it("forgot-password stays silent for an unknown address (no enumeration)", async () => {
      await expect(service.forgotPassword("nobody@example.com")).resolves.toBeUndefined();
      expect(mail.sent).toHaveLength(0);
      expect(verificationTokens.rows).toHaveLength(0);
    });

    it("resets the password, revokes every session, and burns the token", async () => {
      const reg = await service.register("rita@example.com", "oldpassword");
      await service.forgotPassword("RITA@Example.com"); // email is normalized
      const token = mail.lastToken();

      await service.resetPassword(token, "newpassword1");

      // Old password is dead, new one works.
      await expect(service.login("rita@example.com", "oldpassword")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const relogin = await service.login("rita@example.com", "newpassword1");
      expect(relogin.user.id).toBe(reg.user.id);

      // The session that existed before the reset is gone.
      await expect(service.refresh(reg.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
      // And the link can't be replayed.
      await expect(service.resetPassword(token, "another-pass")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("change password (A2)", () => {
    it("requires the current password and re-issues the caller's session", async () => {
      const reg = await service.register("sam@example.com", "oldpassword");

      await expect(
        service.changePassword(reg.user.id, "wrongpassword", "newpassword1"),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const res = await service.changePassword(reg.user.id, "oldpassword", "newpassword1");
      // Fresh pair for this caller...
      expect(res.refreshToken).not.toBe(reg.refreshToken);
      // ...every other session revoked...
      await expect(service.refresh(reg.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
      // ...and the new password is what logs in now.
      await expect(service.login("sam@example.com", "oldpassword")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.login("sam@example.com", "newpassword1")).resolves.toBeTruthy();
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
        new FakeRbacRepo(),
        new FakeVerificationTokenRepo(),
        new FakeMailService(),
      ).onModuleInit();
      expect(users2.rows).toHaveLength(0);
    });
  });

  describe("Google sign-in (A3)", () => {
    const identity = { email: "Gina@Example.com", emailVerified: true, name: "Gina" };

    it("creates a password-less, already-verified account for an unknown email", async () => {
      const res = await service.loginWithGoogle(identity);

      const stored = users.rows[0];
      expect(stored.email).toBe("gina@example.com");
      // No password at all — the whole point of an external-provider account.
      expect(stored.passwordHash).toBeNull();
      // Google already proved the address, so no verification mail is sent.
      expect(stored.emailVerifiedAt).not.toBeNull();
      expect(mail.sent).toHaveLength(0);
      expect(res.accessToken).toBeTruthy();
    });

    it("links into an existing VERIFIED account and leaves its password alone", async () => {
      await service.register("gina@example.com", "supersecret");
      await users.markEmailVerified(users.rows[0].id);
      const hashBefore = users.rows[0].passwordHash;

      await service.loginWithGoogle(identity);

      expect(users.rows).toHaveLength(1);
      expect(users.rows[0].passwordHash).toBe(hashBefore);
      // The password still works — nothing was taken away from a verified owner.
      await expect(service.login("gina@example.com", "supersecret")).resolves.toBeTruthy();
    });

    // The security decision of A3: registration is public and A2 verification is soft, so an
    // attacker can register someone else's address and lie in wait. Google proving ownership
    // evicts them.
    it("EVICTS the squatter of an UNVERIFIED account: clears the password, revokes sessions", async () => {
      await service.register("gina@example.com", "attackerpw");
      const squatter = users.rows[0];
      expect(squatter.emailVerifiedAt).toBeNull();
      expect(refreshTokens.rows.filter((r) => !r.revokedAt)).toHaveLength(1);

      await service.loginWithGoogle(identity);

      expect(users.rows).toHaveLength(1);
      expect(users.rows[0].id).toBe(squatter.id);
      expect(users.rows[0].passwordHash).toBeNull();
      expect(users.rows[0].emailVerifiedAt).not.toBeNull();
      // Every session the squatter held is dead; only the new Google session survives.
      const live = refreshTokens.rows.filter((r) => !r.revokedAt);
      expect(live).toHaveLength(1);
      // The attacker's password no longer opens the account.
      await expect(service.login("gina@example.com", "attackerpw")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("refuses an identity Google itself has not verified", async () => {
      await expect(service.loginWithGoogle({ ...identity, emailVerified: false })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(users.rows).toHaveLength(0);
    });

    it("exchanges a code through the injected fetch (no network in tests)", async () => {
      process.env.GOOGLE_CLIENT_ID = "cid";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      const claims = {
        iss: "accounts.google.com",
        aud: "cid",
        email: "gina@example.com",
        email_verified: true,
        name: "Gina",
      };
      const idToken = `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
      let sentUrl = "";
      let sentBody = "";
      const fakeFetch = (async (url: string, init?: { body?: string }) => {
        sentUrl = url;
        sentBody = init?.body ?? "";
        return { ok: true, json: async () => ({ id_token: idToken }) };
      }) as unknown as typeof fetch;

      const result = await service.exchangeGoogleCode("the-code", fakeFetch);

      expect(result).toEqual({ email: "gina@example.com", emailVerified: true, name: "Gina" });
      // Pinning the endpoint matters: "the token came straight from Google over TLS" is the whole
      // reason `decodeIdToken` may skip signature verification.
      expect(sentUrl).toBe(GOOGLE_TOKEN_ENDPOINT);
      expect(sentBody).toContain("code=the-code");
      expect(sentBody).toContain("grant_type=authorization_code");
    });

    it("surfaces a rejected code as a 400 rather than a crash", async () => {
      process.env.GOOGLE_CLIENT_ID = "cid";
      process.env.GOOGLE_CLIENT_SECRET = "secret";
      const fakeFetch = (async () => ({
        ok: false,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      await expect(service.exchangeGoogleCode("bad", fakeFetch)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("password login on a password-less account fails exactly like an unknown email", async () => {
      await service.loginWithGoogle(identity);

      await expect(service.login("gina@example.com", "anything")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("change-password on a password-less account points at forgot-password", async () => {
      const res = await service.loginWithGoogle(identity);

      await expect(service.changePassword(res.user.id, "old", "newpassword")).rejects.toThrow(
        BadRequestException,
      );
    });

    // The documented escape hatch: a Google-only account CAN gain a password.
    it("forgot-password lets a Google account set its first password, then log in normally", async () => {
      await service.loginWithGoogle(identity);

      await service.forgotPassword("gina@example.com");
      await service.resetPassword(mail.lastToken(), "brandnewpassword");

      const res = await service.login("gina@example.com", "brandnewpassword");
      expect(res.user.email).toBe("gina@example.com");
    });
  });
});
