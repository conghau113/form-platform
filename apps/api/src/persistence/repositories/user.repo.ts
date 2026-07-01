/**
 * Persistence boundary for authenticated accounts (production-hardening 2A; D4: services depend
 * on this interface, never on Prisma). A user's `id` doubles as the tenant `ownerId` on every
 * pre-existing row, so `CurrentOwner` resolves from a verified JWT `sub` with no data backfill.
 */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
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
    passwordHash: string;
    displayName?: string | null;
  }): Promise<UserRecord>;
}
