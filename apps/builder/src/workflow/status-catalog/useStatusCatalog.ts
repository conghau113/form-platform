import type { StatusCatalogEntry } from "@org/workflow-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../../query";
import {
  deleteStatusEntry,
  listStatusCatalog,
  promoteStatusEntry,
  saveStatusEntry,
} from "./client";

/**
 * Status catalog store for the workflow editor (WE4), react-query like {@link usePresets}. Entries
 * live in the api (`/status-catalog`, the library is `global ∪ thisProject`) and are cached under
 * `qk.statusCatalog(projectId)`. `save`/`remove`/`promote` round-trip then `invalidateQueries`, so
 * every consumer (node colours, the picker, the catalog manager) re-reads server truth live. A
 * failed load surfaces an empty catalog (`data` undefined → `[]`), and the editor falls back to the
 * node's own `kind`/`status` snapshot — never blank.
 */
export interface StatusCatalogStore {
  entries: StatusCatalogEntry[];
  loading: boolean;
  save: (entry: StatusCatalogEntry) => Promise<void>;
  remove: (code: string) => Promise<void>;
  /** Promote a project status to global. */
  promote: (code: string) => Promise<void>;
}

export function useStatusCatalog(projectId?: string): StatusCatalogStore {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.statusCatalog(projectId),
    queryFn: () => listStatusCatalog(projectId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.statusCatalog(projectId) });

  const save = useMutation({ mutationFn: saveStatusEntry, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteStatusEntry, onSuccess: invalidate });
  const promote = useMutation({ mutationFn: promoteStatusEntry, onSuccess: invalidate });

  return {
    entries: query.data ?? [],
    loading: query.isPending,
    save: async (entry) => {
      await save.mutateAsync(entry);
    },
    remove: async (code) => {
      await remove.mutateAsync(code);
    },
    promote: async (code) => {
      await promote.mutateAsync(code);
    },
  };
}
