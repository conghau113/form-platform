/**
 * Permission helpers over the caller's effective function codes (product-roadmap Phase D1).
 * The server (`GET /rbac/me/functions`) returns the union of codes across the user's roles in
 * their tenant; the `*` sentinel means "all functions" (a tenant admin). Keep the wildcard rule
 * HERE only — nav gating and the admin pages both call this instead of re-reading the array.
 * Client-side checks only hide surface; the server's FunctionGuard is the real boundary.
 */

/** The superadmin sentinel the tenant's built-in admin role holds. */
export const WILDCARD_FUNCTION = "*";

/** Whether the held function codes grant `code` (directly or via the `*` wildcard). */
export function hasFunction(held: readonly string[], code: string): boolean {
  return held.includes(WILDCARD_FUNCTION) || held.includes(code);
}

/** Whether the held codes grant at least one of `codes` (mirrors the server's any-of guard). */
export function hasAnyFunction(held: readonly string[], codes: readonly string[]): boolean {
  return codes.some((code) => hasFunction(held, code));
}
