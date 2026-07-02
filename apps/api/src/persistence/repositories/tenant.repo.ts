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
   * Get-or-create the user's personal tenant **and** their membership in it, returning the tenant id
   * (idempotent). Requires a real `User` (membership FKs to `User`), so this is the login/register
   * provisioning path — establishing "every logged-in user has a tenant + membership".
   */
  abstract ensurePersonalTenant(userId: string, name?: string): Promise<string>;
}
