import type { WorkflowInstance } from "@org/workflow-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { WorkflowInstanceSummary } from "../workspace/types";
import * as api from "./client";

/**
 * Workflow runtime data hooks (WF3b), react-query like {@link useWorkflows}. The server is the source
 * of truth: it runs the engine (`advance`) and persists, so a mutation just `invalidateQueries` and
 * the next read reflects the new state + history. `fetch` lives only in `client.ts`; no hand-rolled
 * loading flags. The case list is keyed per workflow, a single case by its own id.
 */

/** Lists a workflow's cases (summaries); refetches when `workflowId` changes. */
export function useWorkflowInstances(workflowId: string | undefined): {
  instances: WorkflowInstanceSummary[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.instances(workflowId ?? ""),
    queryFn: () => api.listInstances(workflowId as string),
    enabled: !!workflowId,
  });
  return { instances: query.data ?? [], loading: query.isPending && !!workflowId };
}

/** Loads a single running case by id (for the Run view). */
export function useWorkflowInstance(instanceId: string | undefined): {
  instance: WorkflowInstance | null;
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: qk.instance(instanceId ?? ""),
    queryFn: () => api.getInstance(instanceId as string),
    enabled: !!instanceId,
  });
  return {
    instance: query.data ?? null,
    loading: query.isPending && !!instanceId,
    error: query.error ? (query.error as Error).message : null,
  };
}

/**
 * Starts a fresh case and invalidates the workflow's case list so it appears immediately. Returns
 * the new instance (the caller navigates to it).
 */
export function useStartInstance(
  workflowId: string | undefined,
): (data?: Record<string, unknown>) => Promise<WorkflowInstance> {
  const qc = useQueryClient();
  const start = useMutation({
    mutationFn: (data?: Record<string, unknown>) => api.startInstance(workflowId as string, data),
    onSuccess: () => {
      if (workflowId) qc.invalidateQueries({ queryKey: qk.instances(workflowId) });
    },
  });
  return (data) => start.mutateAsync(data);
}

/**
 * Fires an action against a case. On success it seeds the advanced instance into its own cache and
 * invalidates the workflow's list (the denormalised `current` changed). `mutateAsync` rejects on a
 * 422 so the caller can surface the engine's failure reason.
 */
export function useAdvanceInstance(
  instanceId: string | undefined,
  workflowId: string | undefined,
): (input: { action: string; data?: Record<string, unknown> }) => Promise<WorkflowInstance> {
  const qc = useQueryClient();
  const advance = useMutation({
    mutationFn: (input: { action: string; data?: Record<string, unknown> }) =>
      api.advanceInstance(instanceId as string, input),
    onSuccess: (next) => {
      qc.setQueryData(qk.instance(next.id), next);
      if (workflowId) qc.invalidateQueries({ queryKey: qk.instances(workflowId) });
    },
  });
  return (input) => advance.mutateAsync(input);
}
