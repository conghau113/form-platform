import type { FolderRecord, FormSummary } from "./types";

/**
 * Pure tree assembly for the Explorer (Track W, W2). The api returns flat folder + form lists
 * (`GET /projects/:id/tree`); this builds the nested node array antd `Tree` renders, and resolves
 * the destination folder for a drag-drop. Kept antd-free so it is cheap to unit-test.
 */

export type NodeKind = "folder" | "form";

export interface WorkspaceNode {
  /** Encoded key, `"<kind>:<id>"`, so a node's kind+id survive antd's string-key API. */
  key: string;
  kind: NodeKind;
  id: string;
  title: string;
  isLeaf: boolean;
  children?: WorkspaceNode[];
}

export const folderKey = (id: string): string => `folder:${id}`;
export const formKey = (id: string): string => `form:${id}`;

/** Decode a tree key back into its kind + record id. */
export function parseKey(key: string): { kind: NodeKind; id: string } {
  const i = key.indexOf(":");
  const kind = key.slice(0, i) as NodeKind;
  return { kind, id: key.slice(i + 1) };
}

const byOrderThenName = <T extends { order?: number; name?: string; title?: string }>(
  a: T,
  b: T,
): number => {
  const ao = a.order ?? 0;
  const bo = b.order ?? 0;
  if (ao !== bo) return ao - bo;
  return (a.name ?? a.title ?? "").localeCompare(b.name ?? b.title ?? "");
};

/**
 * Assemble `folders` + `forms` into a nested node array. Folders nest by `parentId` and sort by
 * `order` then name; forms attach under their `folderId` (sorted by title). At each level folders
 * are listed before forms. Root level holds `parentId === null` folders and `folderId === null`
 * forms.
 */
export function buildTree(folders: FolderRecord[], forms: FormSummary[]): WorkspaceNode[] {
  const childFolders = new Map<string | null, FolderRecord[]>();
  for (const f of folders) {
    const list = childFolders.get(f.parentId) ?? [];
    list.push(f);
    childFolders.set(f.parentId, list);
  }

  const folderForms = new Map<string | null, FormSummary[]>();
  for (const form of forms) {
    const list = folderForms.get(form.folderId) ?? [];
    list.push(form);
    folderForms.set(form.folderId, list);
  }

  const formNodes = (parentId: string | null): WorkspaceNode[] =>
    [...(folderForms.get(parentId) ?? [])]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((form) => ({
        key: formKey(form.id),
        kind: "form" as const,
        id: form.id,
        title: form.title,
        isLeaf: true,
      }));

  const folderNodes = (parentId: string | null): WorkspaceNode[] =>
    [...(childFolders.get(parentId) ?? [])].sort(byOrderThenName).map((folder) => ({
      key: folderKey(folder.id),
      kind: "folder" as const,
      id: folder.id,
      title: folder.name,
      isLeaf: false,
      children: [...folderNodes(folder.id), ...formNodes(folder.id)],
    }));

  return [...folderNodes(null), ...formNodes(null)];
}

/**
 * Destination folder id for a drop. Dropping **onto** a folder targets that folder; dropping onto
 * a form leaf, or into a gap between nodes, targets the target's parent folder (a root-level drop
 * → `null`). `into` is antd's `!info.dropToGap` — true when the cursor is over the node body.
 */
export function dropFolderId(
  targetKey: string,
  into: boolean,
  folders: FolderRecord[],
  forms: FormSummary[],
): string | null {
  const { kind, id } = parseKey(targetKey);
  if (kind === "folder" && into) return id;
  if (kind === "folder") return folders.find((f) => f.id === id)?.parentId ?? null;
  return forms.find((f) => f.id === id)?.folderId ?? null;
}
