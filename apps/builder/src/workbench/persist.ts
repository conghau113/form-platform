import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

/* ----------------------------------------------------------------------------
 * Workbench panel-state persistence (F5). A drop-in useState that survives
 * reloads via localStorage. Stored values are untrusted (stale schema, hand
 * edits, another app version), so every read passes a type guard before it is
 * believed; storage failures (privacy mode, quota) silently fall back to
 * in-memory state — persistence is a nicety, never load-bearing.
 * ------------------------------------------------------------------------- */

const PREFIX = "builder.workbench.";

export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      }
    } catch {
      // Unreadable storage or corrupt JSON — use the fallback.
    }
    return fallback;
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Write denied (quota/privacy) — the session still works, just unpersisted.
    }
  }, [key, value]);

  return [value, setValue];
}

/** Guard for string-union state (Segmented values): membership in the literal list. */
export function oneOf<T extends string>(...values: T[]): (v: unknown) => v is T {
  return (v: unknown): v is T => typeof v === "string" && (values as string[]).includes(v);
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}
