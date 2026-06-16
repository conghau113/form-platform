import { useCallback, useEffect, useState } from "react";
import * as api from "./client";
import type { ProjectRecord, ProjectTree } from "./types";

/**
 * Workspace data hooks (Track W, W2). Like `usePresets`, the server is the source of truth: every
 * action round-trips and then refetches, so concurrent edits and server-side normalisation (slugs,
 * cascades) are always reflected. Callers `await` the actions and surface failures with `message`.
 */

export interface ProjectsStore {
  projects: ProjectRecord[];
  loading: boolean;
  reload: () => Promise<void>;
  create: (input: { name: string; description?: string | null }) => Promise<ProjectRecord>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useProjects(): ProjectsStore {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setProjects(await api.listProjects());
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .listProjects()
      .then((list) => alive && setProjects(list))
      .catch(() => alive && setProjects([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const create = useCallback(async (input: { name: string; description?: string | null }) => {
    const project = await api.createProject(input);
    setProjects((list) => [project, ...list]);
    return project;
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    const updated = await api.updateProject(id, { name });
    setProjects((list) => list.map((p) => (p.id === id ? updated : p)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteProject(id);
    setProjects((list) => list.filter((p) => p.id !== id));
  }, []);

  return { projects, loading, reload, create, rename, remove };
}

export interface ProjectTreeStore {
  tree: ProjectTree | null;
  loading: boolean;
  error: string | null;
  /** Refetch the whole tree — every mutating action calls this so state stays server-true. */
  reload: () => Promise<void>;
}

/** Loads a single project's folder/form tree and refetches on demand (after a mutation). */
export function useProjectTree(projectId: string | undefined): ProjectTreeStore {
  const [tree, setTree] = useState<ProjectTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) return;
    const next = await api.getProjectTree(projectId);
    setTree(next);
    setError(null);
  }, [projectId]);

  useEffect(() => {
    let alive = true;
    if (!projectId) return;
    setLoading(true);
    api
      .getProjectTree(projectId)
      .then((next) => {
        if (!alive) return;
        setTree(next);
        setError(null);
      })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [projectId]);

  return { tree, loading, error, reload };
}
