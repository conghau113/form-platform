/**
 * Google sign-in, hand-rolled (product-roadmap A3). The pure, network-free half of the
 * authorization-code flow lives here so it can be unit-tested without a browser or a Google app.
 *
 * No passport: the rest of this API's auth is hand-written too (`auth/jwt-auth.guard.ts`,
 * `auth/cookie.ts`), and the flow is two calls — build an authorize URL, exchange the code.
 */

/** Google's OAuth endpoints. MODULE CONSTANTS on purpose — see {@link decodeIdToken}. */
export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Path the OAuth callback is served on, appended to `APP_PUBLIC_URL` when no explicit URI is set. */
const CALLBACK_PATH = "/api/auth/oauth/google/callback";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** The identity Google vouched for, reduced to what this app stores. */
export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * The single place that decides whether Google sign-in is configured at all — mirroring how
 * `MailService` treats a missing `SMTP_HOST` as "log mode" rather than an error. `null` means the
 * feature is OFF: the routes 404 and the builder hides the button. Roadmap principle: an external
 * dependency is always optional.
 *
 * `redirectUri` is derived HERE rather than in the Zod env schema, because a Zod key cannot
 * reference a sibling key (`APP_PUBLIC_URL`) from its `.default()`.
 */
export function googleConfig(env: NodeJS.ProcessEnv = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const publicUrl = (env.APP_PUBLIC_URL?.trim() || "http://localhost:5173").replace(/\/$/, "");
  return {
    clientId,
    clientSecret,
    redirectUri: env.GOOGLE_REDIRECT_URI?.trim() || `${publicUrl}${CALLBACK_PATH}`,
  };
}

/** The URL the browser is redirected to so the user can pick a Google account. */
export function googleAuthUrl(cfg: GoogleConfig, state: string): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  // No refresh token wanted: we mint our OWN session, we never call Google again on the user's behalf.
  url.searchParams.set("access_type", "online");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Read the claims out of an `id_token`.
 *
 * ⚠️ The signature is deliberately NOT verified, and that is only sound because of exactly how
 * this function is reached: the token comes straight back from a server-to-server HTTPS POST to
 * the hard-coded {@link GOOGLE_TOKEN_ENDPOINT}, authenticated with our `client_secret`. TLS plus a
 * constant (never env-driven) endpoint is what stands in for signature verification — this is
 * Google's own documented guidance and is why no JWKS library is needed.
 *
 * NEVER call this with a token supplied by a client. If a token ever arrives by any other route,
 * verify it against Google's JWKS instead.
 */
export function decodeIdToken(idToken: string, expectedAud: string): GoogleIdentity {
  const payload = idToken.split(".")[1];
  if (!payload) throw new Error("Malformed id_token");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Malformed id_token");
  }
  // Cheap belt-and-braces, so the function stays sound even if it is ever reached another way:
  // a token minted for a different client, or by anyone but Google, must never mint a session.
  if (claims.aud !== expectedAud) throw new Error("id_token audience mismatch");
  if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") {
    throw new Error("id_token issuer mismatch");
  }
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!email) throw new Error("id_token carries no email");
  return {
    email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : undefined,
  };
}
