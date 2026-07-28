import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import type { OrgUnit } from "./client";
import * as api from "./client";

/**
 * Org-unit data hooks (C3), react-query like {@link useAdmin}. The server owns all rules; mutations
 * `invalidateQueries(qk.orgUnits)` and the next read reflects it. `fetch` lives only in `client.ts`.
 */
export function useOrgUnits(enabled = true): { units: OrgUnit[]; loading: boolean } {
  const query = useQuery({ queryKey: qk.orgUnits, queryFn: api.listOrgUnits, enabled });
  return { units: query.data ?? [], loading: enabled && query.isPending };
}

export function useOrgUnitMutations(): {
  create: (name: string, parentId: string | null) => Promise<OrgUnit>;
  rename: (unitId: string, name: string) => Promise<OrgUnit>;
  remove: (unitId: string, cascade: boolean) => Promise<void>;
} {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.orgUnits });
  const create = useMutation({
    mutationFn: (v: { name: string; parentId: string | null }) =>
      api.createOrgUnit({ name: v.name, parentId: v.parentId }),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: (v: { unitId: string; name: string }) => api.renameOrgUnit(v.unitId, v.name),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (v: { unitId: string; cascade: boolean }) =>
      api.deleteOrgUnit(v.unitId, v.cascade),
    onSuccess: invalidate,
  });
  return {
    create: (name, parentId) => create.mutateAsync({ name, parentId }),
    rename: (unitId, name) => rename.mutateAsync({ unitId, name }),
    remove: (unitId, cascade) => remove.mutateAsync({ unitId, cascade }),
  };
}
