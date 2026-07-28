import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
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
import { RbacRepo } from "../../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RefreshTokenRepo } from "../../persistence/repositories/refresh-token.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../../persistence/repositories/tenant.repo.js";
import type { UserRecord } from "../../persistence/repositories/user.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { UserRepo } from "../../persistence/repositories/user.repo.js";
import type { TokenPurpose } from "../../persistence/repositories/verification-token.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { VerificationTokenRepo } from "../../persistence/repositories/verification-token.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { MailService } from "../mail/mail.service.js";
import {
  authLink,
  passwordChangedMail,
  resetPasswordMail,
  verifyEmailMail,
} from "../mail/mail-templates.js";

/** bcrypt work factor — 10 is the common default (~100ms/hash), a sane cost for a self-host API. */
const SALT_ROUNDS = 10;

/** Fallback refresh-token lifetime when `JWT_REFRESH_EXPIRES_IN` is unset (matches env default). */
const DEFAULT_REFRESH_EXPIRES_IN = "30d";

/** Fallbacks for the A2 email-token lifetimes / link base (all match the env defaults). */
const DEFAULT_VERIFY_EXPIRES_IN = "24h";
const DEFAULT_RESET_EXPIRES_IN = "1h";
const DEFAULT_PUBLIC_URL = "http://localhost:5173";

/** The safe, password-free view of an account returned to clients. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  /** `null` until the address is verified (A2). Nothing blocks on it — the UI just nudges. */
  emailVerifiedAt: Date | null;
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
    private readonly rbac: RbacRepo,
    private readonly verificationTokens: VerificationTokenRepo,
    private readonly mail: MailService,
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
    // Verification is a nudge, not a gate (A2): a mail failure must never block the signup.
    await this.sendVerificationEmail(user);
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

  /**
   * Start a password reset (`POST /auth/forgot-password`, A2). Resolves the same way whether or not
   * the address has an account — the endpoint must not become an account-enumeration oracle. Any
   * outstanding reset token is invalidated first so only the newest emailed link works.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    if (!user) return;
    const raw = await this.issueEmailToken(
      user.id,
      "password_reset",
      process.env.AUTH_RESET_TOKEN_EXPIRES_IN ?? DEFAULT_RESET_EXPIRES_IN,
    );
    await this.mail.send(user.email, resetPasswordMail(this.link("/reset-password", raw)));
  }

  /**
   * Finish a password reset (`POST /auth/reset-password`, A2). Consumes the one-time token, stores
   * the new hash, and revokes every session — whoever held the old password (or a stolen refresh
   * token) is locked out, and the account owner logs back in with the new one.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const record = await this.consumeEmailToken(rawToken, "password_reset");
    const user = await this.users.findById(record.userId);
    if (!user) throw new BadRequestException("Invalid or expired token");
    await this.users.updatePassword(user.id, await bcrypt.hash(newPassword, SALT_ROUNDS));
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.mail.send(user.email, passwordChangedMail());
  }

  /** Redeem an email-verification token (`POST /auth/verify-email`, A2). */
  async verifyEmail(rawToken: string): Promise<void> {
    const record = await this.consumeEmailToken(rawToken, "email_verify");
    await this.users.markEmailVerified(record.userId);
  }

  /** Re-send the verification email (`POST /auth/resend-verification`). No-op once verified. */
  async resendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerificationEmail(user);
  }

  /**
   * Change the password of a signed-in account (`POST /auth/change-password`, A2). Requires the
   * current password (so a hijacked browser tab can't lock the owner out), revokes every existing
   * session, and returns a fresh pair so *this* caller stays signed in.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("Account no longer exists");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    await this.users.updatePassword(user.id, await bcrypt.hash(newPassword, SALT_ROUNDS));
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.mail.send(user.email, passwordChangedMail());
    return this.issue(user);
  }

  private async issue(user: UserRecord): Promise<AuthResult> {
    // Auto-provision the caller's personal tenant (product-roadmap B1). Idempotent, so login/refresh
    // for an existing user is a no-op; a freshly registered user (and the bootstrap admin on first
    // login) gets a Tenant + Membership here, establishing "every logged-in user has a tenant".
    const tenantId = await this.tenants.ensurePersonalTenant(
      user.id,
      user.displayName ?? user.email,
    );
    // Auto-provision the tenant owner as its admin (product-roadmap Phase C). Idempotent: gives the
    // user the tenant's `*`-holding admin role so existing users keep full access under RBAC (replacing
    // EVN's hardcoded `code==='ADMIN'` with a data-driven role, §6.6).
    await this.rbac.ensureTenantAdmin(user.id, tenantId);
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

  /** Issue + email a fresh verification link. Swallows failures — signup must not depend on SMTP. */
  private async sendVerificationEmail(user: UserRecord): Promise<void> {
    const raw = await this.issueEmailToken(
      user.id,
      "email_verify",
      process.env.AUTH_VERIFY_TOKEN_EXPIRES_IN ?? DEFAULT_VERIFY_EXPIRES_IN,
    );
    await this.mail.send(
      user.email,
      verifyEmailMail(this.link("/verify-email", raw), user.displayName),
    );
  }

  /**
   * Mint a one-time email token: the raw value goes into the link, only its SHA-256 hash is stored
   * (same shape as the refresh tokens above). Supersedes the user's outstanding tokens of that
   * purpose so an older email can't be replayed after a re-send.
   */
  private async issueEmailToken(
    userId: string,
    purpose: TokenPurpose,
    expiresIn: string,
  ): Promise<string> {
    await this.verificationTokens.invalidateActive(userId, purpose);
    const raw = randomBytes(32).toString("hex");
    await this.verificationTokens.create({
      userId,
      purpose,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + durationToMs(expiresIn)),
    });
    return raw;
  }

  /**
   * Validate + burn a one-time token. Unknown / wrong-purpose / spent / expired all read alike.
   * The burn is a compare-and-set: if a concurrent request consumed the same token first, this one
   * loses the race and is rejected, so a link can never be redeemed twice.
   */
  private async consumeEmailToken(rawToken: string, purpose: TokenPurpose) {
    const record = await this.verificationTokens.findByHash(hashToken(rawToken));
    if (
      !record ||
      record.purpose !== purpose ||
      record.consumedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException("Invalid or expired token");
    }
    if (!(await this.verificationTokens.consume(record.id))) {
      throw new BadRequestException("Invalid or expired token");
    }
    return record;
  }

  /** Absolute link into the SPA for an emailed action. */
  private link(path: string, token: string): string {
    return authLink(process.env.APP_PUBLIC_URL ?? DEFAULT_PUBLIC_URL, path, token);
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
    emailVerifiedAt: user.emailVerifiedAt,
    createdAt: user.createdAt,
  };
}
