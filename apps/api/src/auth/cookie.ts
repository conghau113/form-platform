/**
 * Access-token cookie plumbing (production-hardening 2B). The browser SPA authenticates with an
 * **HttpOnly** cookie instead of a JS-readable bearer token: script can never read or exfiltrate it,
 * which removes token theft via XSS. `SameSite=Strict` means the browser withholds the cookie on
 * cross-site requests, so it doubles as CSRF protection; the builder reaches the API same-origin
 * (via the dev/nginx `/api` proxy) so Strict never gets in the way of a legitimate call.
 */

/** Name of the HttpOnly access-token cookie. Kept in one place so the guard and controller agree. */
export const AUTH_COOKIE_NAME = "access_token";

/** The cookie attributes we set the token with. `secure`/`maxAge` come from config at call time. */
export interface AuthCookieOptions {
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  path: "/";
  maxAge: number;
}

/**
 * Build the cookie options. `secure` is env-driven (`AUTH_COOKIE_SECURE=true` behind HTTPS in
 * production; `false` for plain-HTTP local dev). `maxAgeMs` should mirror the JWT lifetime so the
 * cookie and the token expire together.
 */
export function authCookieOptions(secure: boolean, maxAgeMs: number): AuthCookieOptions {
  return { httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: maxAgeMs };
}

/**
 * Parse a raw `Cookie` request header into a name→value map. Dependency-free (no `cookie-parser`
 * middleware): the guard only needs one cookie and this keeps the surface tiny. Missing/blank → {}.
 */
export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(";") : header;
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
