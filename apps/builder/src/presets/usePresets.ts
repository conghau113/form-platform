import type { Preset } from "@org/form-schema";
import { useCallback, useEffect, useState } from "react";
import { BUILTIN_PRESETS } from "./builtin";
import { deletePreset, listPresets, savePreset } from "./client";

/**
 * Preset store for the builder UI. Built-in presets ship in the bundle; user presets live
 * in the api (`/presets`) and load once on mount. `save`/`remove` round-trip to the server
 * (the source of truth) and then update local state; both reject on failure so the caller
 * can surface a message. A failed initial load degrades to an empty user list.
 */
export interface PresetStore {
  builtin: Preset[];
  user: Preset[];
  loading: boolean;
  save: (preset: Preset) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function usePresets(): PresetStore {
  const [user, setUser] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listPresets()
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
  }, []);

  // Upsert: drop any existing entry with the same id, then prepend the server's copy.
  const save = useCallback(async (preset: Preset) => {
    const saved = await savePreset(preset);
    setUser((list) => [saved, ...list.filter((p) => p.id !== saved.id)]);
  }, []);

  const remove = useCallback(async (id: string) => {
    await deletePreset(id);
    setUser((list) => list.filter((p) => p.id !== id));
  }, []);

  return { builtin: BUILTIN_PRESETS, user, loading, save, remove };
}
