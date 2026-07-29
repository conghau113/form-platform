/**
 * The workspace (tenant) the user is currently working in — the client half of the active-tenant
 * selection. {@link apiFetch} stamps it on every request as `X-Tenant-Id`; the server honours it only
 * when the caller is really a member, so this is a preference, never a permission.
 *
 * Persisted in `localStorage` so the choice survives a reload, and cached in a module variable so the
 * fetch path doesn't touch storage on every call. "No choice yet" is a valid state: the server then
 * falls back to its personal-first default, which is exactly the pre-switcher behaviour.
 */

const STORAGE_KEY = "activeTenantId";

/** Ids are cuids. Anything else came from tampering — and a value with CR/LF would make the
 *  `Headers.set` in `apiFetch` throw, breaking every request rather than just this preference. */
const ID_PATTERN = /^[\w-]{1,64}$/;

let cached: string | null | undefined;

function readStorage(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && ID_PATTERN.test(raw) ? raw : null;
  } catch {
    // Private mode / storage disabled — fall back to "no choice" rather than breaking the app.
    return null;
  }
}

/** The selected workspace id, or `null` when the user hasn't picked one. */
export function getActiveTenantId(): string | null {
  if (cached === undefined) cached = readStorage();
  return cached;
}

/** Persist the selected workspace; `null` clears it (back to the server's default). */
export function setActiveTenantId(tenantId: string | null): void {
  cached = tenantId;
  try {
    if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep the in-memory choice for this session even if it can't be persisted.
  }
}
