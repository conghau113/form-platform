import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { Reflector } from "@nestjs/core";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { RbacRepo, WILDCARD_FUNCTION } from "../persistence/repositories/rbac.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { TenantRepo } from "../persistence/repositories/tenant.repo.js";
import { activeTenantFromRequest } from "./active-tenant.decorator.js";
import type { AuthedRequest } from "./jwt-payload.js";
import { REQUIRE_FUNCTION_KEY } from "./require-function.decorator.js";

/**
 * Function-level authorization guard (product-roadmap Phase C4). Runs after {@link JwtAuthGuard}
 * (which stashes the verified principal on `req.user`). A route without {@link RequireFunction} is
 * not gated. Otherwise the caller's effective functions — the union of function codes over the roles
 * they hold in their **active** tenant (`X-Tenant-Id`, else personal-first) — must include **any**
 * required code (any-of, D1), unless they hold the
 * `*` superadmin code (a tenant admin). No principal → 401; missing tenant or insufficient functions
 * → 403. Server-side is the real boundary; the client only hides nav.
 */
@Injectable()
export class FunctionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacRepo,
    private readonly tenants: TenantRepo,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRE_FUNCTION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const userId = req.user?.sub?.trim();
    if (!userId) throw new UnauthorizedException("No authenticated user");

    // Permissions must come from the workspace the caller is actually working in, or the nav would
    // gate on one tenant's roles while the data below it comes from another.
    const tenantId = await this.tenants.resolveTenantForUser(userId, activeTenantFromRequest(req));
    if (!tenantId) throw new ForbiddenException("No tenant for user");

    const held = new Set(await this.rbac.resolveFunctions(userId, tenantId));
    if (held.has(WILDCARD_FUNCTION)) return true;
    if (required.some((code) => held.has(code))) return true;
    throw new ForbiddenException(`Missing required permission: ${required.join(", ")}`);
  }
}
