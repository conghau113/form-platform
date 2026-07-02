import { apiFetch } from "../lib/apiFetch";
import { API_BASE } from "../presets/config";
import type { UserProfile } from "./types";

/**
 * Thin client for the auth api (`/auth/*`, production-hardening 2B). Authentication is cookie-based:
 * `login`/`register` make the server set an HttpOnly `access_token` cookie, and because the SPA
 * talks to the API same-origin (via the `/api` proxy) the browser sends it automatically — so there
 * is no token for this code to hold or attach. Error handling mirrors `workspace/client.ts`.
 */

async function readError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return data.message ?? res.statusText;
}

const jsonHeaders: Record<string, string> = { "content-type": "application/json" };

/**
 * Resolve the current session's profile, or `null` when unauthenticated (401). Throws otherwise.
 * Goes through {@link apiFetch}, so a merely-expired access token is silently refreshed and the
 * probe still resolves the profile — the session survives a page reload past the access lifetime.
 */
export async function fetchMe(): Promise<UserProfile | null> {
  const res = await apiFetch(`${API_BASE}/auth/me`);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Session check failed: ${await readError(res)}`);
  return (await res.json()) as UserProfile;
}

/**
 * The caller's effective function codes (union over their roles; `*` = tenant admin). Drives the
 * nav gate + admin pages (D1). An anonymous/expired session reads as "no functions" rather than
 * an error so the shell can render while auth settles.
 */
export async function fetchMyFunctions(): Promise<string[]> {
  const res = await apiFetch(`${API_BASE}/rbac/me/functions`);
  if (res.status === 401) return [];
  if (!res.ok) throw new Error(`Load permissions failed: ${await readError(res)}`);
  return (await res.json()) as string[];
}

export async function login(email: string, password: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { user: UserProfile }).user;
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password, displayName }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { user: UserProfile }).user;
}

/** Clear the session cookie server-side. Best-effort — a failure still lets the UI drop its state. */
export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
}
