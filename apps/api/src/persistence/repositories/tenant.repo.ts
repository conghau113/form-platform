/**
 * Persistence boundary for tenants (product-roadmap Phase B1; D4: services depend on this interface,
 * never on Prisma). A tenant is one client installation (`1 tenant = 1 client`); in the personal-tenant
 * model each user owns exactly one, keyed by the stable slug `personal-<ownerId>`.
 */
export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  kind: string;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class TenantRepo {
  /**
   * Get-or-create the tenant that owns an owner's data and return its id (idempotent, keyed by the
   * stable slug `personal-<ownerId>`). Does **not** create a membership, so it is safe for owners
   * that may not have a `User` row (legacy data / the import script). Used to stamp `Project.tenantId`.
   */
  abstract ensureTenantForOwner(ownerId: string, name?: string): Promise<string>;
  /**
   * Read-side complement (B2): the tenant a user belongs to via their `Membership`, or `null` when the
   * user has none. Used to resolve the caller's tenant on requests (every logged-in user has one — B1).
   * Deterministic for multi-membership users (D1 add-member): the **oldest** membership wins, which is
   * the personal tenant created at register — being added to another tenant never flips a user's context.
   */
  abstract findTenantIdForUser(userId: string): Promise<string | null>;
  /**
   * Every tenant the user belongs to via `Membership`, oldest membership first (same ordering as
   * {@link findTenantIdForUser} — the personal tenant leads). B3 unions these for project listing.
   */
  abstract listTenantIdsForUser(userId: string): Promise<string[]>;
  /** Full records of the user's tenants, oldest membership first (B4 — the workspace picker). */
  abstract listTenantsForUser(userId: string): Promise<TenantRecord[]>;
  /** Whether the user holds a `Membership` in the tenant (D1: role assignment targets members only). */
  abstract isMember(userId: string, tenantId: string): Promise<boolean>;
  /** Add a user to a tenant (idempotent upsert on the userId+tenantId unique — D1 add-member). */
  abstract addMember(tenantId: string, userId: string): Promise<void>;
  /**
   * Get-or-create the user's personal tenant **and** their membership in it, returning the tenant id
   * (idempotent). Requires a real `User` (membership FKs to `User`), so this is the login/register
   * provisioning path — establishing "every logged-in user has a tenant + membership".
   */
  abstract ensurePersonalTenant(userId: string, name?: string): Promise<string>;

  /**
   * The tenant a request should operate in: the one the caller asked for (the `X-Tenant-Id` header,
   * surfaced by `@ActiveTenant()`) when they are actually a member of it, otherwise the personal-first
   * default of {@link findTenantIdForUser}. This is the single place the active-workspace choice is
   * honoured, so a forged or stale header can never widen access — membership is re-checked per
   * request, and an unknown tenant silently falls back rather than erroring (no existence leak).
   * Concrete on purpose: every `TenantRepo` implementation inherits it from `isMember` +
   * `findTenantIdForUser`.
   */
  async resolveTenantForUser(userId: string, requestedTenantId?: string): Promise<string | null> {
    const requested = requestedTenantId?.trim();
    if (requested && (await this.isMember(userId, requested))) return requested;
    return this.findTenantIdForUser(userId);
  }
}
