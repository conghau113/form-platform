import { API_BASE } from "../presets/config";

/**
 * Workspace (Track W) client config. Reuses the shared `@app/api` base URL.
 *
 * Auth moved to the browser's HttpOnly cookie (production-hardening 2B): every request the builder
 * makes is same-origin (via the `/api` proxy), so the `access_token` cookie is attached
 * automatically and there is no header for this code to add. `ownerHeaders()` is kept as the shared
 * seam (all `client.ts` files call it) but now contributes nothing; the authenticated owner comes
 * from the verified token server-side, and the UI reads it from {@link useAuth} where it needs the id.
 */
export { API_BASE };

/** Extra request headers for workspace calls. Empty now that auth rides the HttpOnly cookie. */
export function ownerHeaders(): Record<string, string> {
  return {};
}
