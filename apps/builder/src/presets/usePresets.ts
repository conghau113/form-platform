import type { Preset } from "@org/form-schema";
import { useCallback, useEffect, useState } from "react";
import { BUILTIN_PRESETS } from "./builtin";
import { deletePreset, listPresets, promotePreset, savePreset } from "./client";

/**
 * Preset store for the builder UI. Built-in presets ship in the bundle; user presets live
 * in the api (`/presets`) and load on mount (and whenever `projectId` changes — the library
 * is `global ∪ thisProject`). `save`/`remove`/`promote` round-trip to the server (the source
 * of truth) and then update local state; all reject on failure so the caller can surface a
 * message. A failed initial load degrades to an empty user list.
 */
export interface PresetStore {
  builtin: Preset[];
  user: Preset[];
  loading: boolean;
  save: (preset: Preset) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Promote a project preset to global; updates local state in place. */
  promote: (id: string) => Promise<void>;
}

export function usePresets(projectId?: string): PresetStore {
  const [user, setUser] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listPresets(projectId)
      .then((list) => {
        if (alive) setUser(list);
      })
      .catch(() => {
        if (alive) setUser([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Upsert: drop any existing entry with the same id, then prepend the server's copy.
  const save = useCallback(async (preset: Preset) => {
    const saved = await savePreset(preset);
    setUser((list) => [saved, ...list.filter((p) => p.id !== saved.id)]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deletePreset(id);
    setUser((list) => list.filter((p) => p.id !== id));
  }, []);

  const promote = useCallback(async (id: string) => {
    const promoted = await promotePreset(id);
    setUser((list) => list.map((p) => (p.id === id ? promoted : p)));
  }, []);

  return { builtin: BUILTIN_PRESETS, user, loading, save, remove, promote };
}
