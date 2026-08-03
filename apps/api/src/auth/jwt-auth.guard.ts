import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { Reflector } from "@nestjs/core";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { JwtService } from "@nestjs/jwt";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RefreshTokenRepo } from "../persistence/repositories/refresh-token.repo.js";
import { AUTH_COOKIE_NAME, parseCookies } from "./cookie.js";
import type { AuthedRequest, JwtPayload } from "./jwt-payload.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

/**
 * Global authentication guard (production-hardening 2A/2B). Every route requires a valid token
 * unless it is marked {@link Public}. The browser SPA sends it as the HttpOnly `access_token`
 * cookie (preferred); non-browser API clients may still send `Authorization: Bearer <jwt>`. On
 * success the verified payload is stashed on `req.user` so {@link CurrentOwner} resolves the tenant
 * from a trusted `sub` instead of the old operator-declared `x-owner-id` header.
 *
 * Since P5 a valid signature is also not enough on its own: the token's `sid` must still name a live
 * session, which is what makes logout / logout-all / a password change take effect *immediately*
 * instead of at the end of the access token's 15 minutes. That costs one indexed lookup per
 * authenticated request; `@Public` routes never reach it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly refreshTokens: RefreshTokenRepo,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException("Missing authentication token");

    // Only the signature check is wrapped: a failure *inside* the session lookup below is an
    // infrastructure fault and must surface as one, not be laundered into "invalid token".
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    // A valid signature is not enough: only a token that actually names a subject is an access
    // token. Defence in depth against any other JWT this app signs (A3's OAuth `state` is
    // key-separated, but a subject-less token must never authenticate a request even if some
    // future token type shares the secret) — a handler that reads no `sub` would otherwise treat
    // it as a session. `sid` is required for the same reason, and additionally rejects tokens
    // minted before P5, which no session can vouch for.
    if (!payload.sub?.trim() || !payload.sid?.trim()) {
      throw new UnauthorizedException("Invalid or expired token");
    }
    // The revocation check (P5). Same generic message as every other failure above, so it can't be
    // used to tell "this session was logged out" from "this signature is junk".
    if (!(await this.refreshTokens.isSessionActive(payload.sid, payload.sub))) {
      throw new UnauthorizedException("Invalid or expired token");
    }

    req.user = { sub: payload.sub, email: payload.email, sid: payload.sid };
    return true;
  }
}

/** The access token, from the HttpOnly cookie first (browser) then a `Bearer` header (API clients). */
function extractToken(req: AuthedRequest): string | null {
  const fromCookie = parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME]?.trim();
  return fromCookie || extractBearer(req);
}

/** Pull the raw JWT from a `Bearer` Authorization header, or `null` when absent/malformed. */
function extractBearer(req: AuthedRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token?.trim() ? token.trim() : null;
}
