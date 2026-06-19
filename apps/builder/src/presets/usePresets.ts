import type { Preset } from "@org/form-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../query";
import { BUILTIN_PRESETS } from "./builtin";
import { deletePreset, listPresets, promotePreset, savePreset } from "./client";

/**
 * Preset store for the builder UI (react-query as of R4). Built-in presets ship in the bundle;
 * user presets live in the api (`/presets`, the library is `global ∪ thisProject`) and are cached
 * under `qk.presets(projectId)`. `save`/`remove`/`promote` round-trip then `invalidateQueries`,
 * so the cached list re-reads server truth. Because every consumer reads this one cache entry, an
 * edit propagates live to the gallery, the preview, and the "Linked preset" control (the W4
 * invariant). A failed load surfaces no user presets (`data` is undefined → empty list).
 */
export interface PresetStore {
  builtin: Preset[];
  user: Preset[];
  loading: boolean;
  save: (preset: Preset) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Promote a project preset to global. */
  promote: (id: string) => Promise<void>;
}

export function usePresets(projectId?: string): PresetStore {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.presets(projectId),
    queryFn: () => listPresets(projectId),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.presets(projectId) });

  const save = useMutation({ mutationFn: savePreset, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deletePreset, onSuccess: invalidate });
  const promote = useMutation({ mutationFn: promotePreset, onSuccess: invalidate });

  return {
    builtin: BUILTIN_PRESETS,
    user: query.data ?? [],
    loading: query.isPending,
    save: async (preset) => {
      await save.mutateAsync(preset);
    },
    remove: async (id) => {
      await remove.mutateAsync(id);
    },
    promote: async (id) => {
      await promote.mutateAsync(id);
    },
  };
}
