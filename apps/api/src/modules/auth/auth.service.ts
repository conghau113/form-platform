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
import type { UserRecord } from "../../persistence/repositories/user.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { UserRepo } from "../../persistence/repositories/user.repo.js";

/** bcrypt work factor — 10 is the common default (~100ms/hash), a sane cost for a self-host API. */
const SALT_ROUNDS = 10;

/** The safe, password-free view of an account returned to clients. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}

/** A successful register/login result: the signed access token plus the caller's profile. */
export interface AuthResult {
  token: string;
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

  private async issue(user: UserRecord): Promise<AuthResult> {
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { token, user: toProfile(user) };
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
