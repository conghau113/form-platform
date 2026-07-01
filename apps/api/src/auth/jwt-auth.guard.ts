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
import type { AuthedRequest, JwtPayload } from "./jwt-payload.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

/**
 * Global authentication guard (production-hardening 2A). Every route requires a valid
 * `Authorization: Bearer <jwt>` unless it is marked {@link Public}. On success the verified
 * payload is stashed on `req.user` so {@link CurrentOwner} resolves the tenant from a trusted
 * `sub` instead of the old operator-declared `x-owner-id` header.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException("Missing bearer token");

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { sub: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}

/** Pull the raw JWT from a `Bearer` Authorization header, or `null` when absent/malformed. */
function extractBearer(req: AuthedRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token?.trim() ? token.trim() : null;
}
