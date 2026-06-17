import { useCallback, useMemo } from "react";
import { isStringArray, usePersistentState } from "./workbench/persist";

/** Shared "pin to top" state (U1): a persisted set of ids the user has pinned — palette
 *  component entries, presets, or property-panel sections. Backed by the workbench
 *  localStorage helper, so pins survive reloads and degrade gracefully when storage is
 *  unavailable. Order in storage is preserved (pin order), but membership is the only
 *  thing callers usually need, so a derived Set is exposed for cheap lookups. */
export function usePins(key: string): {
  /** Pinned ids in pin order (oldest first). */
  order: string[];
  pinned: Set<string>;
  isPinned: (id: string) => boolean;
  toggle: (id: string) => void;
} {
  const [order, setOrder] = usePersistentState<string[]>(key, [], isStringArray);
  const pinned = useMemo(() => new Set(order), [order]);
  const isPinned = useCallback((id: string) => pinned.has(id), [pinned]);
  const toggle = useCallback(
    (id: string) =>
      setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [setOrder],
  );
  return { order, pinned, isPinned, toggle };
}
