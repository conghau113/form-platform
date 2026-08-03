/**
 * Verified access-token claims (production-hardening 2A). `sub` is the user id, which doubles as
 * the tenant `ownerId` on every row — {@link CurrentOwner} reads it. `email` rides along for
 * convenience/logging. Kept tiny on purpose: no roles here (server-side role checks stay in the
 * services against real membership — Phase 2C).
 *
 * `sid` names the sign-in session the token belongs to (product-roadmap A2/P5) and is what makes an
 * access token revocable: {@link JwtAuthGuard} refuses the token once that session has no live
 * refresh row. Tokens minted before P5 carry no `sid` and are rejected — the browser recovers via
 * its refresh cookie without the user noticing.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  sid: string;
}

/** The slice of the HTTP request the guard populates and the decorators read. */
export interface AuthedRequest {
  user?: JwtPayload;
  headers: Record<string, string | string[] | undefined>;
}
