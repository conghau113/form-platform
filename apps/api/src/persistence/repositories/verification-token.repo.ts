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
  /**
   * Claim a token: mark it redeemed and report whether *this* call won the race. Compare-and-set
   * (`consumedAt IS NULL` in the WHERE) so two concurrent redemptions of the same link can't both
   * proceed — `false` means someone else already consumed it.
   */
  abstract consume(id: string): Promise<boolean>;
  /** Consume every outstanding token of one purpose for a user (issuing a new one supersedes them). */
  abstract invalidateActive(userId: string, purpose: TokenPurpose): Promise<void>;
}
