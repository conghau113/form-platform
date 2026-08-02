import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { CaseCast } from "./client";
import * as api from "./client";

/**
 * Data hooks for a case's cast (Phase E3a) — kept out of `useWorkOrders.ts` so neither file grows
 * past what is comfortable to read. react-query as everywhere else; `fetch` lives in `client.ts`.
 *
 * Casting someone CHANGES what the case shows them, so every mutation also invalidates the case
 * itself (`qk.instance`): a role that unmasks a gated field must not leave a stale masked copy on
 * screen.
 */

const EMPTY: CaseCast = { participants: [], myRoles: [] };

/** A case's cast + the caller's own roles. Reading needs only `viewer`, like the comment thread. */
export function useCaseParticipants(instanceId: string): {
  cast: CaseCast;
  loading: boolean;
  error: string | null;
} {
  const query = useQuery({
    queryKey: qk.caseParticipants(instanceId),
    queryFn: () => api.listCaseParticipants(instanceId),
  });
  return {
    cast: query.data ?? EMPTY,
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
  };
}

/** Cast a member into a role; rejects with the server's message (a viewer is refused with 403). */
export function useAddCaseParticipant(
  instanceId: string,
): (input: { roleCode: string; userId: string }) => Promise<void> {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (input: { roleCode: string; userId: string }) =>
      api.addCaseParticipant(instanceId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.caseParticipants(instanceId) });
      qc.invalidateQueries({ queryKey: qk.instance(instanceId) });
    },
  });
  return async (input) => {
    await add.mutateAsync(input);
  };
}

/** Remove someone from the cast. */
export function useRemoveCaseParticipant(
  instanceId: string,
): (participantId: string) => Promise<void> {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (participantId: string) => api.removeCaseParticipant(instanceId, participantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.caseParticipants(instanceId) });
      qc.invalidateQueries({ queryKey: qk.instance(instanceId) });
    },
  });
  return async (participantId) => {
    await remove.mutateAsync(participantId);
  };
}
