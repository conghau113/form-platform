import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import * as api from "./client";
import type { ProjectRecord, ProjectTree, TenantSummary } from "./types";

/**
 * Workspace data hooks (Track W, react-query as of R4). The server is the source of truth: the
 * list/tree live in the query cache, and every mutation `invalidateQueries` so the next read
 * reflects server-side normalisation (slugs, cascades) and concurrent edits. No hand-rolled
 * `alive` flags, manual `loading`, or imperative `reload()` — the cache owns all of that.
 * Callers `await` the mutation actions (`mutateAsync`) and surface failures with `message`.
 */

export interface ProjectsStore {
  projects: ProjectRecord[];
  loading: boolean;
  create: (input: {
    name: string;
    description?: string | null;
    /** Target tenant (B4). Omitted → the user's personal tenant. */
    tenantId?: string;
    /** Placement in the tenant's org tree (C3). Omitted → unplaced. */
    orgUnitId?: string;
  }) => Promise<ProjectRecord>;
  rename: (id: string, name: string) => Promise<void>;
  setOrgUnit: (id: string, orgUnitId: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useProjects(): ProjectsStore {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: qk.projects, queryFn: api.listProjects });
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.projects });

  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateProject(id, { name }),
    onSuccess: invalidate,
  });
  const setOrgUnit = useMutation({
    mutationFn: ({ id, orgUnitId }: { id: string; orgUnitId: string | null }) =>
      api.updateProject(id, { orgUnitId }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: api.deleteProject,
    onSuccess: invalidate,
  });

  return {
    projects: query.data ?? [],
    loading: query.isPending,
    create: (input) => create.mutateAsync(input),
    rename: async (id, name) => {
      await rename.mutateAsync({ id, name });
    },
    setOrgUnit: async (id, orgUnitId) => {
      await setOrgUnit.mutateAsync({ id, orgUnitId });
    },
    remove: async (id) => {
      await remove.mutateAsync(id);
    },
  };
}

/** The user's tenant memberships (B4) — drives the New-project workspace picker. */
export function useMyTenants(): { tenants: TenantSummary[]; loading: boolean } {
  const query = useQuery({ queryKey: qk.myTenants, queryFn: api.listMyTenants });
  return { tenants: query.data ?? [], loading: query.isPending };
}

/**
 * The caller's server-derived domain roles on a project (E3c) — what the runtime views hand the
 * renderer as `access`, so the form shows exactly the fields the server would let through.
 *
 * `[]` while it loads, which masks the most: a gated field must never flash into view before the
 * answer arrives. Roles change only when an admin edits them, so this is cached, not polled.
 */
export function useMyProjectRoles(projectId: string | undefined): {
  roles: string[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.myProjectRoles(projectId ?? ""),
    queryFn: () => api.getMyProjectRoles(projectId as string),
    enabled: !!projectId,
  });
  return { roles: query.data ?? [], loading: query.isPending && !!projectId };
}

export interface ProjectTreeStore {
  tree: ProjectTree | null;
  loading: boolean;
  error: string | null;
  /** Mark the cached tree stale + refetch — called after a mutation (rename/move/delete/create). */
  invalidate: () => Promise<void>;
}

/** Loads a single project's folder/form tree; refetches automatically when `projectId` changes. */
export function useProjectTree(projectId: string | undefined): ProjectTreeStore {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.projectTree(projectId ?? ""),
    queryFn: () => api.getProjectTree(projectId as string),
    enabled: !!projectId,
  });

  return {
    tree: query.data ?? null,
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
    invalidate: async () => {
      if (projectId) await qc.invalidateQueries({ queryKey: qk.projectTree(projectId) });
    },
  };
}
