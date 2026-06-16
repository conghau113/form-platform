/** Minimal folder shape needed to reason about the adjacency-list tree. */
export interface FolderNode {
  id: string;
  parentId: string | null;
}

/**
 * Would re-parenting `folderId` under `newParentId` create a cycle? True when `newParentId` is
 * the folder itself or any of its descendants (walking up from `newParentId` reaches `folderId`).
 * `folders` is the flat list for the project. A missing/`null` `newParentId` (move to root) is
 * always safe. Guards `PATCH /folders/:id` moves so the tree can never loop.
 */
export function wouldCreateCycle(
  folders: FolderNode[],
  folderId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  if (newParentId === folderId) return true;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cursor: string | null = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === folderId) return true;
    if (seen.has(cursor)) break; // pre-existing cycle / detached chain — stop, don't loop forever
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}
