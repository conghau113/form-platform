import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEED_OWNER_ID } from "../../common/constants.js";
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

describe("AuthService", () => {
  const jwt = new JwtService({
    secret: "test-secret-at-least-16-chars",
    signOptions: { expiresIn: "1h" },
  });
  let users: FakeUserRepo;
  let service: AuthService;

  beforeEach(() => {
    users = new FakeUserRepo();
    service = new AuthService(users, jwt);
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

    // Token carries sub = user id.
    const payload = await jwt.verifyAsync<{ sub: string; email: string }>(res.token);
    expect(payload.sub).toBe(res.user.id);
    expect(payload.email).toBe("alice@example.com");
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
    expect(res.token).toBeTruthy();
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
      await new AuthService(users2, jwt).onModuleInit();
      expect(users2.rows).toHaveLength(0);
    });
  });
});
