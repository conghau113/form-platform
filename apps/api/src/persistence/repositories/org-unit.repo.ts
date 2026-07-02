/** Org-unit as the repo layer exposes it — an adjacency-list node (`parentId`) in a tenant's org tree. */
export interface OrgUnitRecord {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  kind: string | null;
  order: number;
  createdAt: Date;
}

export interface OrgUnitCreateInput {
  tenantId: string;
  parentId?: string | null;
  name: string;
  kind?: string | null;
  order?: number;
}

/** Patchable org-unit fields: rename, move (`parentId`), reorder, relabel (`kind`). */
export interface OrgUnitUpdateInput {
  name?: string;
  parentId?: string | null;
  kind?: string | null;
  order?: number;
}

/**
 * Persistence boundary for org units (product-roadmap Phase B2). Mirrors {@link FolderRepo}: the flat
 * `list(tenantId)` is returned to the client (and to the cycle guard); the tree is built client-side.
 * Moving a unit = one `parentId` update; deleting cascades child units via Prisma `onDelete: Cascade`,
 * and members fall off the deleted unit via `Membership.orgUnit onDelete: SetNull`.
 */
export abstract class OrgUnitRepo {
  abstract create(input: OrgUnitCreateInput): Promise<OrgUnitRecord>;
  /** Flat list of every org unit in a tenant (client builds the tree). */
  abstract list(tenantId: string): Promise<OrgUnitRecord[]>;
  abstract findById(id: string): Promise<OrgUnitRecord | null>;
  abstract update(id: string, patch: OrgUnitUpdateInput): Promise<OrgUnitRecord>;
  abstract delete(id: string): Promise<void>;
  /** Direct children of a unit: sub-unit count + member count (for the non-empty delete guard). */
  abstract countChildren(id: string): Promise<{ units: number; members: number }>;
}
