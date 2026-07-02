import { SetMetadata } from "@nestjs/common";

/** Reflector metadata key holding the function codes a route requires (product-roadmap Phase C4). */
export const REQUIRE_FUNCTION_KEY = "requireFunction";

/**
 * Gate a route on one or more permission function codes (product-roadmap Phase C4). The global
 * {@link FunctionGuard} allows the request only when the caller's effective functions (union over
 * their roles in their tenant) include **all** listed codes — unless they hold the `*` superadmin
 * code. Routes without this decorator are not function-gated (they still require authentication via
 * {@link JwtAuthGuard}; owner-scoping stays in the service). Defense-in-depth: hiding nav ≠ security.
 *
 * Usage: `@RequireFunction('role.admin')`.
 */
export const RequireFunction = (...functions: string[]) =>
  SetMetadata(REQUIRE_FUNCTION_KEY, functions);
