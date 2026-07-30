/**
 * Persistence boundary for authenticated accounts (production-hardening 2A; D4: services depend
 * on this interface, never on Prisma). A user's `id` doubles as the tenant `ownerId` on every
 * pre-existing row, so `CurrentOwner` resolves from a verified JWT `sub` with no data backfill.
 */
export interface UserRecord {
  id: string;
  email: string;
  /** `null` = external-provider-only account (A3); it has no password to compare against. */
  passwordHash: string | null;
  displayName: string | null;
  /** When the account proved it owns `email` (A2); `null` = not verified yet. */
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class UserRepo {
  /** Lookup by login handle (email is unique); `null` when no account exists. */
  abstract findByEmail(email: string): Promise<UserRecord | null>;
  /** Lookup by id (the tenant/owner id); `null` when absent. */
  abstract findById(id: string): Promise<UserRecord | null>;
  /**
   * Create an account. `id` is optional — omit it for a normal signup (cuid), or pass an explicit
   * id (e.g. the bootstrap admin uses `SEED_OWNER_ID` so pre-2A data stays owned).
   */
  abstract create(input: {
    id?: string;
    email: string;
    /** Omit / `null` for an external-provider-only account (A3). */
    passwordHash?: string | null;
    displayName?: string | null;
  }): Promise<UserRecord>;
  /**
   * Replace the stored password hash (A2: reset-password / change-password). `null` CLEARS it,
   * which A3 uses to evict whoever was squatting an unverified address.
   */
  abstract updatePassword(id: string, passwordHash: string | null): Promise<void>;
  /** Stamp `emailVerifiedAt` (A2: a redeemed verification token). Idempotent by design. */
  abstract markEmailVerified(id: string): Promise<void>;
}
