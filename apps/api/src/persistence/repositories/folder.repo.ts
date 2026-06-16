/** Folder as the repo layer exposes it — an adjacency-list node (`parentId`) in a project tree. */
export interface FolderRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: Date;
}

export interface FolderCreateInput {
  projectId: string;
  parentId?: string | null;
  name: string;
  order?: number;
}

/** Patchable folder fields: rename, move (`parentId`), reorder. */
export interface FolderUpdateInput {
  name?: string;
  parentId?: string | null;
  order?: number;
}

/** Counts used by the non-empty delete guard (block unless `?cascade=true`). */
export interface FolderChildCounts {
  folders: number;
  forms: number;
}

/**
 * Persistence boundary for folders. The flat `list(projectId)` is returned to the client (and to
 * the cycle/guard helpers); the tree is built client-side. Moving a folder = one `parentId`
 * update; deleting cascades child folders via Prisma `onDelete: Cascade`, while forms fall to the
 * project root via the FormRecord `folder onDelete: SetNull` relation (forms are never destroyed).
 */
export abstract class FolderRepo {
  abstract create(input: FolderCreateInput): Promise<FolderRecord>;
  /** Flat list of every folder in a project (client builds the tree). */
  abstract list(projectId: string): Promise<FolderRecord[]>;
  abstract findById(id: string): Promise<FolderRecord | null>;
  abstract update(id: string, patch: FolderUpdateInput): Promise<FolderRecord>;
  abstract delete(id: string): Promise<void>;
  /** Direct children of a folder: sub-folder count + form count (for the non-empty guard). */
  abstract countChildren(folderId: string): Promise<FolderChildCounts>;
}
