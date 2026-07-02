/**
 * Persistence boundary for refresh tokens (production-hardening A1; D4: services depend on this
 * interface, never on Prisma). Only the SHA-256 hash of a token is ever stored, so lookups are by
 * hash. Rotation and logout mark a row `revokedAt`; `revokeAllForUser` powers "log out everywhere"
 * and the reuse-detection response (a replayed, already-revoked token nukes the whole user's set).
 */
export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export abstract class RefreshTokenRepo {
  /** Persist a freshly issued token (already hashed). */
  abstract create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRecord>;
  /** Lookup by the stored hash; `null` when no such token exists. */
  abstract findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Mark a single token revoked (idempotent). Used by rotation and logout. */
  abstract revoke(id: string): Promise<void>;
  /** Revoke every not-yet-revoked token for a user (logout-all / reuse response). */
  abstract revokeAllForUser(userId: string): Promise<void>;
}
