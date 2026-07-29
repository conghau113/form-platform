import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthedRequest } from "./jwt-payload.js";

/** Header the client uses to name the workspace it is currently working in. */
export const ACTIVE_TENANT_HEADER = "x-tenant-id";

/**
 * Reads the workspace the caller asked to operate in (the active-tenant selection). The client
 * (`lib/apiFetch.ts`) stamps `X-Tenant-Id` on every request from its stored choice; absent header
 * means "no preference", which keeps the pre-existing personal-first behaviour.
 *
 * This decorator deliberately does **not** validate: it only normalises. Membership is checked in
 * {@link TenantRepo.resolveTenantForUser}, so there is exactly one authority for whether a requested
 * tenant is honoured — a header naming a tenant the caller doesn't belong to falls back instead of
 * granting anything.
 *
 * Usage: `list(@CurrentOwner() userId: string, @ActiveTenant() activeTenantId?: string)`.
 */
export const ActiveTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    activeTenantFromRequest(ctx.switchToHttp().getRequest<AuthedRequest>()),
);

/** Same extraction for guards/interceptors, which get the raw request rather than a param. */
export function activeTenantFromRequest(req: AuthedRequest): string | undefined {
  const raw = req.headers?.[ACTIVE_TENANT_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value || undefined;
}
