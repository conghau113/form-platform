import { useCallback, useMemo, useState } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface History<T> {
  present: T;
  /** Push a new present, recording the previous one for undo (clears the redo stack). */
  set: (next: T | ((prev: T) => T)) => void;
  /** Replace the present WITHOUT recording history (e.g. loading a fresh document). */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/** Undo/redo history over an immutable value. Each `set` records one step.
 *  Like useState, `initial` may be a value or a lazy initializer run once. */
export function useHistory<T>(initial: T | (() => T)): History<T> {
  const [state, setState] = useState<HistoryState<T>>(() => ({
    past: [],
    present: typeof initial === "function" ? (initial as () => T)() : initial,
    future: [],
  }));

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(s.present) : next;
      if (value === s.present) return s;
      return { past: [...s.past, s.present], present: value, future: [] };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setState({ past: [], present: next, future: [] });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        present: previous,
        future: [s.present, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        past: [...s.past, s.present],
        present: next,
        future: s.future.slice(1),
      };
    });
  }, []);

  return useMemo(
    () => ({
      present: state.present,
      set,
      reset,
      undo,
      redo,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state, set, reset, undo, redo],
  );
}
