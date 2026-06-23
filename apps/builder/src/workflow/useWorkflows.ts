import type { WorkflowDefinition } from "@org/workflow-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { WorkflowSummary } from "../workspace/types";
import * as api from "./client";

/**
 * Workflow data hooks (Workflow track WF1), react-query like the workspace hooks. The server is the
 * source of truth: the list/body live in the query cache and every mutation `invalidateQueries` so
 * the next read reflects server-side normalisation (migrate, placement). `fetch` lives only in
 * `client.ts`; no hand-rolled loading flags or imperative reloads. Mirrors `useWorkspace.ts`.
 */

export interface WorkflowsStore {
  workflows: WorkflowSummary[];
  loading: boolean;
  /** Mark the cached list stale + refetch — called after a create/move/delete. */
  invalidate: () => Promise<void>;
}

/** Lists a project's workflow summaries; refetches automatically when `projectId` changes. */
export function useWorkflows(projectId: string | undefined): WorkflowsStore {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.workflows(projectId ?? ""),
    queryFn: () => api.listWorkflows(projectId as string),
    enabled: !!projectId,
  });

  return {
    workflows: query.data ?? [],
    loading: query.isPending,
    invalidate: async () => {
      if (projectId) await qc.invalidateQueries({ queryKey: qk.workflows(projectId) });
    },
  };
}

/** Loads a single workflow contract by id (for the editor route). */
export function useWorkflow(id: string | undefined): {
  workflow: WorkflowDefinition | null;
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: qk.workflow(id ?? ""),
    queryFn: () => api.loadWorkflow(id as string),
    enabled: !!id,
  });
  return {
    workflow: query.data ?? null,
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
  };
}

/**
 * Persists a workflow body and invalidates both the list and the single-workflow cache so the
 * Explorer title and a reload reflect server normalisation. The editor passes the migrated
 * definition; placement is omitted (an existing workflow keeps its folder server-side).
 */
export function useSaveWorkflow(
  projectId: string | undefined,
): (body: WorkflowDefinition) => Promise<WorkflowDefinition> {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (body: WorkflowDefinition) => api.saveWorkflow(body),
    onSuccess: (saved) => {
      if (projectId) qc.invalidateQueries({ queryKey: qk.workflows(projectId) });
      qc.invalidateQueries({ queryKey: qk.workflow(saved.id) });
    },
  });
  return (body) => save.mutateAsync(body);
}
