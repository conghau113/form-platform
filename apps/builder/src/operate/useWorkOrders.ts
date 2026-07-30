import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { qk } from "../query";
import type { AssigneeOption, CaseComment, RunnableWorkflow, WorkOrderPage } from "./client";
import * as api from "./client";
import { type WorkOrderQueryState, workOrderSearch } from "./work-order-query";

/**
 * Work-order data hooks (Phase E), react-query like {@link useAdmin}. Paging/sorting/filtering are
 * the server's job, so the whole query state is the cache key — changing a filter is just another
 * key. Assignment is the only mutation; it invalidates the entire `work-orders` prefix (every
 * cached page can contain the row) plus the workflow's own case list. `fetch` lives in `client.ts`.
 */

export function useWorkOrders(
  state: WorkOrderQueryState,
  enabled: boolean,
): { page: WorkOrderPage; loading: boolean; error: string | null } {
  const search = workOrderSearch(state);
  const query = useQuery({
    queryKey: qk.workOrders(search),
    queryFn: () => api.listWorkOrders(search),
    enabled,
    // Keep the previous page on screen while the next one loads — a work queue that blanks out on
    // every sort click reads as broken.
    placeholderData: (prev) => prev,
  });
  return {
    page: query.data ?? { rows: [], total: 0 },
    // `isFetching` too: with the placeholder in place `isPending` is false while the NEXT page
    // loads, which would leave the table showing old rows under a new page number, unannounced.
    loading: enabled && (query.isPending || query.isFetching),
    error: query.error ? (query.error as Error).message : null,
  };
}

/** Members of the active workspace + an id→display-name index for rendering actors. */
export function useAssignees(enabled: boolean): {
  assignees: AssigneeOption[];
  nameOf: (userId: string | null | undefined) => string | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.workOrderAssignees,
    queryFn: api.listAssignees,
    enabled,
  });
  const assignees = useMemo(() => query.data ?? [], [query.data]);
  const nameOf = useMemo(() => {
    const byId = new Map(assignees.map((a) => [a.id, a.displayName || a.email]));
    // Unknown ids render as nothing rather than a raw user id — an id is noise to an operator.
    return (userId: string | null | undefined) => (userId ? (byId.get(userId) ?? null) : null);
  }, [assignees]);
  return { assignees, nameOf, loading: enabled && query.isPending };
}

/** Workflows the caller may start a case of — the "Tạo việc" picker. */
export function useRunnableWorkflows(enabled: boolean): {
  workflows: RunnableWorkflow[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: qk.workOrderWorkflows,
    queryFn: api.listRunnableWorkflows,
    enabled,
  });
  return { workflows: query.data ?? [], loading: enabled && query.isPending };
}

/**
 * Assign (or unassign, with `null`) a case. Rejects with the server's message so the caller can
 * surface a refusal — the server re-checks run access and workspace membership.
 */
export function useAssignCase(): (input: {
  instanceId: string;
  assigneeId: string | null;
  workflowId?: string;
}) => Promise<void> {
  const qc = useQueryClient();
  const assign = useMutation({
    mutationFn: (input: { instanceId: string; assigneeId: string | null; workflowId?: string }) =>
      api.assignCase(input.instanceId, input.assigneeId),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.workOrderPages });
      if (input.workflowId) qc.invalidateQueries({ queryKey: qk.instances(input.workflowId) });
    },
  });
  return (input) => assign.mutateAsync(input);
}

/**
 * Set a case's deadline / urgency (Phase E2). Invalidates the same keys as assignment: every cached
 * page can hold the row, and the workflow's own case list shows it too.
 */
export function useUpdateWorkOrder(): (input: {
  instanceId: string;
  patch: { dueAt?: string | null; priority?: number };
  workflowId?: string;
}) => Promise<void> {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (input: {
      instanceId: string;
      patch: { dueAt?: string | null; priority?: number };
      workflowId?: string;
    }) => api.updateWorkOrder(input.instanceId, input.patch),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: qk.workOrderPages });
      if (input.workflowId) qc.invalidateQueries({ queryKey: qk.instances(input.workflowId) });
    },
  });
  return (input) => update.mutateAsync(input);
}

/** A case's comment thread. Reading only needs `viewer`, so every case reader may fetch it. */
export function useCaseComments(instanceId: string): {
  comments: CaseComment[];
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: qk.caseComments(instanceId),
    queryFn: () => api.listCaseComments(instanceId),
  });
  return {
    comments: query.data ?? [],
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
  };
}

/** Post a comment; rejects with the server's message (a viewer is refused with 403). */
export function useAddCaseComment(instanceId: string): (body: string) => Promise<void> {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: string) => api.addCaseComment(instanceId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.caseComments(instanceId) }),
  });
  return async (body) => {
    await add.mutateAsync(body);
  };
}
