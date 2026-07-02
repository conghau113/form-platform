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

  // --- User ↔ role assignments (many-to-many) ---
  /** Replace the set of role ids a user holds **within one tenant** (Phase C2). Scoped by `tenantId`
   *  so it never touches the user's assignments in other tenants (the roadmap targets multi-tenant). */
  abstract setUserRoles(userId: string, tenantId: string, roleIds: string[]): Promise<void>;
  /** The role ids currently assigned to a user (optionally narrowed to one tenant). */
  abstract listUserRoleIds(userId: string, tenantId?: string): Promise<string[]>;

  // --- Derived (enforcement) ---
  /** A user's effective permission set in a tenant: the union of function codes over the roles they
   *  hold in that tenant. Includes {@link WILDCARD_FUNCTION} when an admin role is held. */
  abstract resolveFunctions(userId: string, tenantId: string): Promise<string[]>;
  /** Idempotently ensure a tenant has an admin role (holding `*`) and that `userId` is assigned it.
   *  The login/provisioning path (auth.issue) calls this so a tenant owner keeps full access. */
  abstract ensureTenantAdmin(userId: string, tenantId: string): Promise<void>;
}
