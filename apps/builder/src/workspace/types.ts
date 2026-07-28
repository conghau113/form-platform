/**
 * Workspace record shapes (Track W). These mirror the api repo boundary types
 * (`apps/api/src/persistence/repositories/{project,folder,form}.repo.ts`) but are declared here
 * so the builder stays decoupled from the api package. Dates arrive as ISO strings over the wire.
 */

export interface ProjectRecord {
  id: string;
  ownerId: string;
  /** Owning tenant (B3/B4). */
  tenantId: string;
  /** Placement in the tenant's org tree (C3); `null` = unplaced. */
  orgUnitId: string | null;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /tenants` item (B4): a tenant the user belongs to + what they may do there. */
export interface TenantSummary {
  id: string;
  name: string;
  kind: string;
  /** Whether this is the user's own personal tenant. */
  personal: boolean;
  /** The project role the user's RBAC functions confer in this tenant, or null. */
  projectRole: "owner" | "editor" | "viewer" | null;
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

/** Index summary of a running workflow case (no body) — mirrors the api `WorkflowInstanceSummary`. */
export interface WorkflowInstanceSummary {
  id: string;
  workflowId: string;
  projectId: string;
  current: string;
  /** Denormalized human label derived from the case data (#1), or null when none was derived. */
  label: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Index summary of a form submission (no body) — mirrors the api `SubmissionSummary` (FS1). */
export interface SubmissionSummary {
  id: string;
  formId: string;
  projectId: string;
  submittedBy: string;
  submittedAt: string;
}

/** Index summary of a published form version (no body) — mirrors the api `FormVersionSummary` (FB1). */
export interface FormVersionSummary {
  id: string;
  formId: string;
  projectId: string;
  /** 1-based publish sequence number (per form). */
  version: number;
  /** `formVersion` of the frozen snapshot (denorm of `body.formVersion`). */
  formVersion: number;
  publishedBy: string;
  /** ISO-8601 timestamp of publication. */
  publishedAt: string;
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
