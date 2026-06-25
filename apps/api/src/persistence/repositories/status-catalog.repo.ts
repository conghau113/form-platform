import type { StatusCatalogEntry, StatusCatalogScope } from "@org/workflow-schema";

/** Identity of a stored catalog entry, enough for the service to route access/ownership. */
export interface StatusCatalogMeta {
  ownerId: string;
  scope: StatusCatalogScope;
  projectId: string | null;
}

/** A project's identity for listing its shared catalog: which project, owned by whom. */
export interface StatusCatalogProjectScope {
  id: string;
  ownerId: string;
}

/**
 * Persistence boundary for the workflow status catalog (WE4). Owner- and scope-aware, mirroring
 * {@link PresetRepo}: every row is scoped to an `ownerId`, and an entry is either `scope:"global"`
 * (visible in every project) or `scope:"project"` (visible only in its `projectId`). Validation
 * (incl. the scope/projectId invariant) happens in the service via `parseStatusCatalogEntry`; the
 * repo persists the normalized entry. `code` is the global PK + the value a workflow node
 * references via `statusCode`.
 *
 * Project entries are a *shared* project library: they are stored under the project's owner, so
 * every collaborator who can see the project sees the same catalog. The service decides the
 * effective `ownerId` and gates it through `ProjectsService`; the repo stays a thin owner-scoped
 * store.
 */
export abstract class StatusCatalogRepo {
  /**
   * The user's global entries, plus a project's shared entries when `project` is given. Global
   * rows are owned by `userId`; project rows are owned by `project.ownerId`.
   */
  abstract list(userId: string, project?: StatusCatalogProjectScope): Promise<StatusCatalogEntry[]>;
  /** The stored identity of the entry with this code, or `null` if no such entry exists. */
  abstract findMeta(code: string): Promise<StatusCatalogMeta | null>;
  /** Upsert the normalized entry by code under `ownerId` (scope/projectId taken from the entry). */
  abstract upsert(ownerId: string, entry: StatusCatalogEntry): Promise<StatusCatalogEntry>;
  /** Remove by code (scoped to `ownerId`); `false` when nothing was deleted (service maps → 404). */
  abstract remove(ownerId: string, code: string): Promise<boolean>;
  /** Promote an entry to global (`scope:"global"`, `projectId:null`); `null` when missing. */
  abstract promote(ownerId: string, code: string): Promise<StatusCatalogEntry | null>;
}
