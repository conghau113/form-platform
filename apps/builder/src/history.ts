import { useCallback, useMemo, useState } from "react";
import {
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  createHistory,
  type HistoryEntry,
  jumpTo as jumpToPure,
  type History as PureHistory,
  present as presentOf,
  pushHistory,
  redoHistory,
  resetHistory,
  undoHistory,
} from "./engine/history";

export type { HistoryEntry } from "./engine/history";

export interface History<T> {
  present: T;
  /** Push a new present, recording a step for undo (clears the redo stack).
   *  An optional `label` names the step for the History panel. */
  set: (next: T | ((prev: T) => T), label?: string) => void;
  /** Replace the present WITHOUT recording history (e.g. loading a fresh document). */
  reset: (next: T) => void;
  undo: () => void;
  redo: () => void;
  /** Move the present to any recorded entry (History panel). */
  jumpTo: (index: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The full timeline oldest→newest, for the History panel. */
  entries: readonly HistoryEntry<T>[];
}

/** Undo/redo history over an immutable value, delegating to the pure
 *  `engine/history` module. Like useState, `initial` may be a value or a lazy
 *  initializer run once. */
export function useHistory<T>(initial: T | (() => T)): History<T> {
  const [state, setState] = useState<PureHistory<T>>(() =>
    createHistory(typeof initial === "function" ? (initial as () => T)() : initial),
  );

  const set = useCallback((next: T | ((prev: T) => T), label?: string) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(presentOf(s)) : next;
      return pushHistory(s, value, label);
    });
  }, []);

  const reset = useCallback((next: T) => setState(resetHistory(next)), []);
  const undo = useCallback(() => setState(undoHistory), []);
  const redo = useCallback(() => setState(redoHistory), []);
  const jumpTo = useCallback((index: number) => setState((s) => jumpToPure(s, index)), []);

  return useMemo(
    () => ({
      present: presentOf(state),
      set,
      reset,
      undo,
      redo,
      jumpTo,
      canUndo: canUndoOf(state),
      canRedo: canRedoOf(state),
      entries: state.entries,
    }),
    [state, set, reset, undo, redo, jumpTo],
  );
}
