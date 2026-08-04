import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { ExternalCaller, ExternalRequest } from "./api-key.guard.js";

/**
 * Resolves the API-key caller that {@link ApiKeyGuard} authenticated (EVN §12, D0-a). Mirrors
 * `CurrentOwner`, including the defensive throw: the guard always runs first on this controller, so
 * an absent caller means the guard binding was lost — which must fail closed, not resolve to a
 * tenant-less read.
 *
 * Usage: `getFormTemplate(@CurrentCaller() caller: ExternalCaller)`.
 */
export const CurrentCaller = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ExternalCaller => {
    const req = ctx.switchToHttp().getRequest<ExternalRequest>();
    const caller = req.externalCaller;
    if (!caller?.tenantId) throw new UnauthorizedException("Invalid API key");
    return caller;
  },
);
