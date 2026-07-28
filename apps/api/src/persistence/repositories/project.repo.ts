/** Project as the repo layer exposes it (no Prisma types leak across the boundary). */
export interface ProjectRecord {
  id: string;
  ownerId: string;
  /** Owning tenant (B1). B3 reads it to resolve tenant-membership access on top of `ownerId`. */
  tenantId: string;
  /** Placement in the tenant's org tree (C3); `null` = unplaced. Data-scoped roles reach it only when
   *  it sits in their scoped subtree. */
  orgUnitId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields settable on create; `slug` is resolved by the service (unique per tenant as of B4). */
export interface ProjectCreateInput {
  ownerId: string;
  /** Target tenant (B4). Omitted → the creator's personal tenant (the pre-B4 behaviour). */
  tenantId?: string;
  /** Placement in the tenant's org tree (C3); omitted/null → unplaced. */
  orgUnitId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
}

/** Patchable project fields (W1: rename + description; slug stays stable once created). C3 adds
 *  org-unit placement: `undefined` leaves it unchanged, `null` unplaces, a string moves it. */
export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
  orgUnitId?: string | null;
}

/**
 * Persistence boundary for projects (D4: services depend on this interface, never on Prisma).
 * `ensureUnfiled` keeps the W0 default-landing project; W1 adds full owner-scoped CRUD.
 */
export abstract class ProjectRepo {
  /** Get-or-create the owner's "Unfiled" project (idempotent). */
  abstract ensureUnfiled(ownerId: string): Promise<ProjectRecord>;
  abstract create(input: ProjectCreateInput): Promise<ProjectRecord>;
  /** All projects owned by `ownerId`, most-recently-updated first. */
  abstract list(ownerId: string): Promise<ProjectRecord[]>;
  /** One project by id, or `null` when absent (service checks ownership → 404 on mismatch). */
  abstract findById(id: string): Promise<ProjectRecord | null>;
  /** Resolve many projects in one query (any order); missing ids are simply absent from the result. */
  abstract findByIds(ids: string[]): Promise<ProjectRecord[]>;
  /** All projects belonging to any of `tenantIds` (B3 tenant-scoped listing), most-recent first. */
  abstract listByTenants(tenantIds: string[]): Promise<ProjectRecord[]>;
  abstract update(id: string, patch: ProjectUpdateInput): Promise<ProjectRecord>;
  abstract delete(id: string): Promise<void>;
}
