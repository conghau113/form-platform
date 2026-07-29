import { API_BASE } from "../presets/config";
import { getActiveTenantId } from "./activeTenant";

/**
 * `fetch` wrapper that keeps a session alive across access-token expiry (production-hardening A1).
 *
 * Access tokens are short-lived; the long-lived refresh token lives in a separate HttpOnly cookie.
 * When any API call comes back `401`, we hit `POST /auth/refresh` once — which rotates the cookies
 * server-side — then transparently retry the original request. Concurrent 401s share a single
 * in-flight refresh (`refreshInFlight`) so a burst never fires N refreshes: that matters because
 * refresh rotation treats a replayed token as theft and would revoke every session.
 *
 * If the refresh itself fails the session is genuinely over: we surface the original 401 to the
 * caller (so existing `res.status === 401` handling still works) and notify the auth layer via
 * {@link setSessionExpiredHandler} so the app drops to the login screen.
 *
 * It is also the one place the selected workspace is attached (`X-Tenant-Id`), so every tenant-scoped
 * endpoint sees the same context without each `client.ts` remembering to pass it.
 *
 * Same signature as `fetch`, so call sites migrate by swapping `fetch` → `apiFetch`.
 */

/** Endpoints that must never trigger a refresh-retry: they set/clear the cookies, or ARE refresh. */
const AUTH_BYPASS = ["/auth/login", "/auth/register", "/auth/logout", "/auth/refresh"];

let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

/** Register (or clear) the callback fired when a refresh fails and the session is truly over. */
export function setSessionExpiredHandler(fn: (() => void) | null): void {
  onSessionExpired = fn;
}

/** Attempt a token refresh, deduplicated: parallel callers await the same request. */
function ensureRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, { method: "POST" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Add the selected workspace header, leaving `init` untouched when no workspace is selected. */
function withActiveTenant(init?: RequestInit): RequestInit | undefined {
  const tenantId = getActiveTenantId();
  if (!tenantId) return init;
  const headers = new Headers(init?.headers);
  headers.set("X-Tenant-Id", tenantId);
  return { ...init, headers };
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Built once so the retry below sends the identical request, headers included.
  const request = withActiveTenant(init);
  const res = await fetch(input, request);
  if (res.status !== 401 || AUTH_BYPASS.some((p) => urlOf(input).includes(p))) return res;

  const refreshed = await ensureRefresh();
  if (!refreshed) {
    onSessionExpired?.();
    return res;
  }
  return fetch(input, request);
}
