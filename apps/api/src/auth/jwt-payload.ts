/**
 * Verified access-token claims (production-hardening 2A). `sub` is the user id, which doubles as
 * the tenant `ownerId` on every row — {@link CurrentOwner} reads it. `email` rides along for
 * convenience/logging. Kept tiny on purpose: no roles here (server-side role checks stay in the
 * services against real membership — Phase 2C).
 */
export interface JwtPayload {
  sub: string;
  email: string;
}

/** The slice of the HTTP request the guard populates and the decorators read. */
export interface AuthedRequest {
  user?: JwtPayload;
  headers: Record<string, string | string[] | undefined>;
}
