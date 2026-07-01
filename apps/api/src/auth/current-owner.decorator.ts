import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { AuthedRequest } from "./jwt-payload.js";

/**
 * Resolves the current owner/tenant id from the authenticated principal (production-hardening 2A).
 * The global {@link JwtAuthGuard} verifies the bearer token and stashes the payload on `req.user`
 * before this decorator runs, so `sub` is always present on a protected route. Because every row
 * has been `ownerId`-scoped since Track W, swapping the old `x-owner-id` header for the verified
 * `sub` is non-destructive — a bootstrap admin seeded with `id = SEED_OWNER_ID` keeps pre-2A data
 * reachable.
 *
 * Usage: `findAll(@CurrentOwner() ownerId: string)`.
 */
export const CurrentOwner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const sub = req.user?.sub?.trim();
    if (!sub) throw new UnauthorizedException("No authenticated user");
    return sub;
  },
);
