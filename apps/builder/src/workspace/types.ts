/**
 * Workspace record shapes (Track W). These mirror the api repo boundary types
 * (`apps/api/src/persistence/repositories/{project,folder,form}.repo.ts`) but are declared here
 * so the builder stays decoupled from the api package. Dates arrive as ISO strings over the wire.
 */

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FolderRecord {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: string;
}

export interface FormSummary {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: string;
}

/** Org-index summary of a workflow (no body) — mirrors the api `WorkflowSummary` repo type. */
export interface WorkflowSummary {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  status: string | null;
  updatedAt: string;
}

/** `GET /projects/:id/tree` payload: flat lists the client assembles into a tree. */
export interface ProjectTree {
  project: ProjectRecord;
  folders: FolderRecord[];
  forms: FormSummary[];
}

/** A grantable collaborator role (the owner is implicit, derived from `ProjectRecord.ownerId`). */
export type MemberRole = "editor" | "viewer";

/** A sharing grant (W5). `userId` is the collaborator's `x-owner-id`. */
export interface ProjectMember {
  projectId: string;
  userId: string;
  role: MemberRole;
  createdAt: string;
}

/** `GET /projects/:id/members` payload: the canonical owner plus collaborator grants. */
export interface ProjectMembersView {
  ownerId: string;
  members: ProjectMember[];
}
