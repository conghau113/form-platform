import { createHash } from "node:crypto";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ExternalIntegrationRepo } from "../../persistence/repositories/external-integration.repo.js";

/** Header the integrating system presents its credential in. */
export const API_KEY_HEADER = "x-api-key";

/** What a successful key authentication puts on the request — the tenant every read is scoped to. */
export interface ExternalCaller {
  keyId: string;
  tenantId: string;
}

/** The slice of the HTTP request this guard populates and {@link CurrentCaller} reads — mirrors
 *  `AuthedRequest` rather than importing express types the app does not otherwise depend on. */
export interface ExternalRequest {
  externalCaller?: ExternalCaller;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Authentication for the `/external/*` machine-to-machine surface (EVN §12, D0-a).
 *
 * The controller is `@Public()` because the global `JwtAuthGuard` would otherwise 401 a caller that
 * has no browser session — which means **this guard is the only thing standing in front of these
 * routes**. Both decorators are therefore applied at the *controller class*, never per method: bound
 * per method, a route added later would silently inherit `@Public()` without inheriting the key
 * check and be wide open.
 *
 * Authentication is a single indexed lookup on the SHA-256 digest (the {@link RefreshToken}
 * pattern): the raw key is never stored, so there is no plaintext to compare and no reason to
 * hand-roll a timing-safe comparison over a table scan.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly repo: ExternalIntegrationRepo) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ExternalRequest>();
    const raw = readApiKey(req);
    if (!raw) throw new UnauthorizedException("Missing API key");

    // One message for absent, wrong and revoked alike — a caller must not be able to probe which.
    const key = await this.repo.findActiveKeyByHash(hashApiKey(raw));
    if (!key) throw new UnauthorizedException("Invalid API key");

    req.externalCaller = { keyId: key.id, tenantId: key.tenantId };
    return true;
  }
}

/** SHA-256 hex of a raw API key — the only form of it that is ever stored or queried. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * The presented key, or `null` when the header is absent or blank.
 *
 * Express folds a repeated `X-Api-Key` into one comma-joined string, so that arrives as a value the
 * digest simply will not match — a rejection, not a bypass. The array branch is for the handful of
 * headers Node exposes as arrays, and for tests that construct the request shape directly.
 */
function readApiKey(req: ExternalRequest): string | null {
  const header = req.headers[API_KEY_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.trim() || null;
}
