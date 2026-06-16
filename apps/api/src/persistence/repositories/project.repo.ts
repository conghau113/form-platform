/** Minimal project shape the repo layer exposes (no Prisma types leak across the boundary). */
export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
}

/**
 * Persistence boundary for projects. W0 only needs the default **"Unfiled"** project so forms
 * have a home; full Project CRUD + `/tree` arrive in W1.
 */
export abstract class ProjectRepo {
  /** Get-or-create the owner's "Unfiled" project (idempotent). */
  abstract ensureUnfiled(ownerId: string): Promise<ProjectRecord>;
}
