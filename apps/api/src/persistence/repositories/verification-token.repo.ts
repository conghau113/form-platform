/**
 * Persistence boundary for single-use email tokens (product-roadmap A2; D4: services depend on this
 * interface, never on Prisma). Mirrors {@link RefreshTokenRepo}: only the SHA-256 hash is stored, so
 * lookups go by hash. One table serves both {@link TokenPurpose}s — redemption marks `consumedAt`,
 * and issuing a fresh token invalidates the account's outstanding ones for that purpose.
 */
export type TokenPurpose = "email_verify" | "password_reset";

export interface VerificationTokenRecord {
  id: string;
  userId: string;
  purpose: TokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export abstract class VerificationTokenRepo {
  /** Persist a freshly issued token (already hashed). */
  abstract create(input: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord>;
  /** Lookup by the stored hash; `null` when no such token exists. */
  abstract findByHash(tokenHash: string): Promise<VerificationTokenRecord | null>;
  /** Mark a token redeemed (idempotent) so it can never be replayed. */
  abstract consume(id: string): Promise<void>;
  /** Consume every outstanding token of one purpose for a user (issuing a new one supersedes them). */
  abstract invalidateActive(userId: string, purpose: TokenPurpose): Promise<void>;
}
