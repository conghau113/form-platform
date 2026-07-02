import { createHash, randomBytes } from "node:crypto";
import {
  ConflictException,
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { SEED_OWNER_ID } from "../../common/constants.js";
import { durationToMs } from "../../config/env.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RefreshTokenRepo } from "../../persistence/repositories/refresh-token.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import type { UserRecord } from "../../persistence/repositories/user.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { UserRepo } from "../../persistence/repositories/user.repo.js";

/** bcrypt work factor — 10 is the common default (~100ms/hash), a sane cost for a self-host API. */
const SALT_ROUNDS = 10;

/** Fallback refresh-token lifetime when `JWT_REFRESH_EXPIRES_IN` is unset (matches env default). */
const DEFAULT_REFRESH_EXPIRES_IN = "30d";

/** The safe, password-free view of an account returned to clients. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}

/**
 * A successful register/login/refresh result: a short-lived signed access token, a long-lived
 * rotating refresh token (raw — the controller drops it into the HttpOnly `refresh_token` cookie;
 * only its hash is stored), plus the caller's profile.
 */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

/**
 * Authentication service (production-hardening 2A). Owns password hashing (bcrypt) and access-token
 * issuance (`@nestjs/jwt`, secret/expiry from validated env). Self-managed — no external IdP — so
 * the stack stays fully self-hostable via docker-compose. Never leaks `passwordHash` past this
 * boundary; login/registration errors are deliberately generic to avoid account enumeration.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly users: UserRepo,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenRepo,
    private readonly tenants: TenantRepo,
  ) {}

  /** Seed the bootstrap admin (if configured) so pre-2A `ownerId="local"` data keeps its owner. */
  async onModuleInit(): Promise<void> {
    await this.bootstrapAdmin();
  }

  async register(email: string, password: string, displayName?: string): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    if (await this.users.findByEmail(normalized)) {
      throw new ConflictException("Email already registered");
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.users.create({
      email: normalized,
      passwordHash,
      displayName: displayName?.trim() || null,
    });
    return this.issue(user);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    // Compare against a real (or, when absent, dummy) hash either way to keep timing uniform.
    const ok = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
    if (!user || !ok) throw new UnauthorizedException("Invalid credentials");
    return this.issue(user);
  }

  /** The authenticated caller's own profile (`GET /auth/me`). */
  async me(userId: string): Promise<UserProfile> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("Account no longer exists");
    return toProfile(user);
  }

  /**
   * Exchange a refresh token for a fresh pair (`POST /auth/refresh`). Rotates: the presented token
   * is revoked and a new one issued, so a captured token is single-use. A token presented *after*
   * it was already revoked (rotation or logout) is a replay — we revoke every token for that user
   * (reuse detection) so a thief can't outlast the legitimate client.
   */
  async refresh(rawToken: string): Promise<AuthResult> {
    const record = await this.refreshTokens.findByHash(hashToken(rawToken));
    if (!record) throw new UnauthorizedException("Invalid refresh token");
    if (record.revokedAt) {
      await this.refreshTokens.revokeAllForUser(record.userId);
      throw new UnauthorizedException("Refresh token already used");
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Refresh token expired");
    }
    const user = await this.users.findById(record.userId);
    if (!user) throw new UnauthorizedException("Account no longer exists");
    await this.refreshTokens.revoke(record.id);
    return this.issue(user);
  }

  /** Revoke the presented refresh token (`POST /auth/logout`). Best-effort: absent/unknown is a no-op. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const record = await this.refreshTokens.findByHash(hashToken(rawToken));
    if (record && !record.revokedAt) await this.refreshTokens.revoke(record.id);
  }

  /** Revoke every active session for a user (`POST /auth/logout-all` — "log out everywhere"). */
  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  private async issue(user: UserRecord): Promise<AuthResult> {
    // Auto-provision the caller's personal tenant (product-roadmap B1). Idempotent, so login/refresh
    // for an existing user is a no-op; a freshly registered user (and the bootstrap admin on first
    // login) gets a Tenant + Membership here, establishing "every logged-in user has a tenant".
    await this.tenants.ensurePersonalTenant(user.id, user.displayName ?? user.email);
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    const refreshToken = await this.issueRefreshToken(user.id);
    return { accessToken, refreshToken, user: toProfile(user) };
  }

  /** Mint + persist (hashed) a new opaque refresh token; returns the raw value for the cookie. */
  private async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const ttlMs = durationToMs(process.env.JWT_REFRESH_EXPIRES_IN ?? DEFAULT_REFRESH_EXPIRES_IN);
    await this.refreshTokens.create({
      userId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return raw;
  }

  private async bootstrapAdmin(): Promise<void> {
    // Read straight from process.env (already Zod-validated at boot) — same convention as
    // ai.config.ts. Avoids a global-`ConfigService` constructor dependency in this service.
    const email = process.env.AUTH_BOOTSTRAP_EMAIL;
    const password = process.env.AUTH_BOOTSTRAP_PASSWORD;
    if (!email || !password) return;
    if (await this.users.findById(SEED_OWNER_ID)) return;
    const normalized = normalizeEmail(email);
    if (await this.users.findByEmail(normalized)) return;
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.users.create({
      id: SEED_OWNER_ID,
      email: normalized,
      passwordHash,
      displayName: "Administrator",
    });
  }
}

/** A fixed bcrypt hash of a random string — compared against on unknown-email logins so the code
 *  path (and timing) matches a real user, mitigating username-enumeration via response time. */
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Xk2dAt7bU7Y8s0X0eXwq2m0pV0h1O";

/** SHA-256 of a raw refresh token — only this digest is stored, so a DB leak can't mint sessions. */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toProfile(user: UserRecord): UserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
  };
}
