/**
 * Persistence boundary for refresh tokens (production-hardening A1; D4: services depend on this
 * interface, never on Prisma). Only the SHA-256 hash of a token is ever stored, so lookups are by
 * hash. Rotation and logout mark a row `revokedAt`; `revokeAllForUser` powers "log out everywhere"
 * and the reuse-detection response — which since P5 only fires when the replayed token's session is
 * still live, because a replay on a session the user themselves ended is a stale client, not theft.
 */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  /** Groups every token one sign-in rotates through — the JWT `sid` claim (A2/P5). */
  sessionId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export abstract class RefreshTokenRepo {
  /** Persist a freshly issued token (already hashed). */
  abstract create(input: {
    userId: string;
    sessionId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
  /** Lookup by the stored hash; `null` when no such token exists. */
  abstract findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark a single token revoked (idempotent). Used by rotation. */
  abstract revoke(id: string): Promise<void>;
  /**
   * Revoke every not-yet-revoked token of one session — "log out this device" (A2/P5). Logout must
   * end the *session*, not one row: {@link isSessionActive} answers for the session, so revoking a
   * single row would leave the access token alive if that session ever held two live rows (which a
   * pair of genuinely concurrent refreshes can still produce — see the A1 non-atomic-rotation gap).
   * Scoped by `userId` for the same reason {@link isSessionActive} is: ownership belongs in the
   * query, not in the caller's assumptions.
   */
  abstract revokeSession(sessionId: string, userId: string): Promise<void>;
  /** Revoke every not-yet-revoked token for a user (logout-all / reuse response). */
  abstract revokeAllForUser(userId: string): Promise<void>;
  /**
   * Is this session still usable (A2/P5)? True only when it still owns a row that is **neither
   * revoked nor expired** — "a row exists" alone would keep a 30-day-old session alive forever,
   * and "not revoked" alone would resurrect one whose last token has already lapsed. `userId` is
   * matched too: both claims come from the same signed token today, so this is defence in depth,
   * but it makes "this session belongs to this subject" a property of the query rather than an
   * assumption. Called by {@link JwtAuthGuard} on every authenticated request, hence the index.
   */
  abstract isSessionActive(sessionId: string, userId: string): Promise<boolean>;
}
