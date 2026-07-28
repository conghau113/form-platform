/**
 * Persistence boundary for RBAC (product-roadmap Phase C1/C2; services depend on this interface,
 * never on Prisma). Covers the whole RBAC aggregate: the platform function catalog, tenant-scoped
 * roles, role→function grants, and user↔role assignments, plus two derived helpers the enforcement
 * layer needs — {@link resolveFunctions} (a user's effective permission set in a tenant) and
 * {@link ensureTenantAdmin} (idempotent provisioning of a tenant's admin role + owner assignment).
 */

/** The `*` sentinel function code: a role holding it grants every function (superadmin). */
export const WILDCARD_FUNCTION = "*";

/** The name of the auto-provisioned per-tenant admin role (holds {@link WILDCARD_FUNCTION}). */
export const ADMIN_ROLE_NAME = "Admin";

/** A permission code in the platform catalog (Phase C1). `code` is stable; `system` marks the base set. */
export interface FunctionRecord {
  code: string;
  name: string;
  parentCode: string | null;
  system: boolean;
}

/** Seed input for a base catalog function (upserted idempotently at boot). */
export interface FunctionSeed {
  code: string;
  name: string;
  parentCode?: string | null;
}

/** A tenant-scoped role as the repo exposes it (Phase C2). */
export interface RoleRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  system: boolean;
  createdAt: Date;
}

export interface RoleCreateInput {
  tenantId: string;
  name: string;
  description?: string | null;
  system?: boolean;
}

/** Patchable role fields (name/description). `system` and `tenantId` are never patched here. */
export interface RoleUpdateInput {
  name?: string;
  description?: string | null;
}

/** A tenant member as the admin user list shows them (Phase D1): identity + the role ids they hold
 *  **in this tenant** (a user may hold roles in other tenants; those are never listed here). */
export interface TenantUserRecord {
  id: string;
  email: string;
  displayName: string | null;
  roleIds: string[];
}

/** One role a user holds in a tenant, paired with its data-scope (Phase C3). `functions` is the role's
 *  granted codes; `scopeOrgUnitIds` is the org units it is scoped to — **empty means tenant-wide** (the
 *  role reaches every project). The `ProjectsService` chokepoint combines these per project's org unit. */
export interface ScopedGrant {
  functions: string[];
  scopeOrgUnitIds: string[];
}

export abstract class RbacRepo {
  /** Idempotently upsert the platform base function catalog (Phase C1; called at boot). */
  abstract seedFunctions(functions: FunctionSeed[]): Promise<void>;
  /** The full function catalog (for the admin UI). */
  abstract listFunctions(): Promise<FunctionRecord[]>;

  // --- Roles (tenant-scoped) ---
  abstract createRole(input: RoleCreateInput): Promise<RoleRecord>;
  abstract listRoles(tenantId: string): Promise<RoleRecord[]>;
  abstract findRoleById(id: string): Promise<RoleRecord | null>;
  abstract updateRole(id: string, patch: RoleUpdateInput): Promise<RoleRecord>;
  abstract deleteRole(id: string): Promise<void>;

  // --- Role → function grants ---
  /** Replace the whole set of function codes granted to a role (Phase C2). */
  abstract setRoleFunctions(roleId: string, functionCodes: string[]): Promise<void>;
  /** The function codes currently granted to a role. */
  abstract listRoleFunctions(roleId: string): Promise<string[]>;

  // --- Role data-scopes (Phase C3) ---
  /** Replace the org units a role is scoped to (empty = tenant-wide). */
  abstract setRoleDataScopes(roleId: string, orgUnitIds: string[]): Promise<void>;
  /** The org-unit ids a role is currently scoped to (empty = tenant-wide). */
  abstract listRoleDataScopes(roleId: string): Promise<string[]>;

  // --- User ↔ role assignments (many-to-many) ---
  /** The tenant's members with the role ids each holds in that tenant (Phase D1 admin user list). */
  abstract listTenantUsers(tenantId: string): Promise<TenantUserRecord[]>;
  /** Replace the set of role ids a user holds **within one tenant** (Phase C2). Scoped by `tenantId`
   *  so it never touches the user's assignments in other tenants (the roadmap targets multi-tenant). */
  abstract setUserRoles(userId: string, tenantId: string, roleIds: string[]): Promise<void>;
  /** The role ids currently assigned to a user (optionally narrowed to one tenant). */
  abstract listUserRoleIds(userId: string, tenantId?: string): Promise<string[]>;

  // --- Derived (enforcement) ---
  /** A user's effective permission set in a tenant: the union of function codes over the roles they
   *  hold in that tenant. Includes {@link WILDCARD_FUNCTION} when an admin role is held. Tenant-wide —
   *  used by the endpoint {@link FunctionGuard} and nav; per-project scoping uses {@link resolveScopedGrants}. */
  abstract resolveFunctions(userId: string, tenantId: string): Promise<string[]>;
  /** The roles a user holds in a tenant, each with its functions and data-scope (Phase C3). The
   *  `ProjectsService` chokepoint uses this to grant per-project access by the project's org unit. */
  abstract resolveScopedGrants(userId: string, tenantId: string): Promise<ScopedGrant[]>;
  /** Idempotently ensure a tenant has an admin role (holding `*`) and that `userId` is assigned it.
   *  The login/provisioning path (auth.issue) calls this so a tenant owner keeps full access. */
  abstract ensureTenantAdmin(userId: string, tenantId: string): Promise<void>;
}
