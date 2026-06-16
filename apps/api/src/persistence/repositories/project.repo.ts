/** Project as the repo layer exposes it (no Prisma types leak across the boundary). */
export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Fields settable on create; `slug` is resolved by the service (unique per owner). */
export interface ProjectCreateInput {
  ownerId: string;
  name: string;
  slug: string;
  description?: string | null;
}

/** Patchable project fields (W1: rename + description; slug stays stable once created). */
export interface ProjectUpdateInput {
  name?: string;
  description?: string | null;
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
  abstract update(id: string, patch: ProjectUpdateInput): Promise<ProjectRecord>;
  abstract delete(id: string): Promise<void>;
}
