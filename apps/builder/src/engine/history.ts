/* ----------------------------------------------------------------------------
 * Undo/redo history as a pure, value-generic structure (Designable's history
 * rebuilt as plain TS). The whole timeline lives in `entries` oldest→newest
 * with `cursor` pointing at the current present, so the F1 History panel can
 * list every step and `jumpTo` any of them. Every op returns the SAME history
 * reference when it would be a no-op.
 * ------------------------------------------------------------------------- */

export interface HistoryEntry<T> {
  value: T;
  label?: string;
  /** Groups one continuous gesture (e.g. a drag-resize) into a single undo step:
   *  a push whose `coalesce` tag matches the current present's REPLACES it in place
   *  instead of appending a new entry. Each gesture uses a fresh tag. */
  coalesce?: string;
}

export interface History<T> {
  entries: HistoryEntry<T>[];
  /** Index into `entries` of the current present (0 ≤ cursor < entries.length). */
  cursor: number;
}

export function createHistory<T>(value: T, label?: string): History<T> {
  return { entries: [{ value, label }], cursor: 0 };
}

export function present<T>(h: History<T>): T {
  return h.entries[h.cursor].value;
}

export function canUndo<T>(h: History<T>): boolean {
  return h.cursor > 0;
}

export function canRedo<T>(h: History<T>): boolean {
  return h.cursor < h.entries.length - 1;
}

export function historyEntries<T>(h: History<T>): readonly HistoryEntry<T>[] {
  return h.entries;
}

/** Record a new present, discarding any redo entries past the cursor. A value
 *  equal to the current present is a no-op (same reference). */
export function pushHistory<T>(
  h: History<T>,
  value: T,
  label?: string,
  coalesce?: string,
): History<T> {
  if (Object.is(value, present(h))) return h;
  const kept = h.entries.slice(0, h.cursor + 1);
  // Coalesce: when the current present carries the same gesture tag, overwrite it
  // so a whole drag collapses to one undo step (the slice is a fresh array).
  if (coalesce !== undefined && kept[kept.length - 1]?.coalesce === coalesce) {
    kept[kept.length - 1] = { value, label, coalesce };
    return { entries: kept, cursor: kept.length - 1 };
  }
  return { entries: [...kept, { value, label, coalesce }], cursor: kept.length };
}

/** Replace the present and drop all history (e.g. loading a fresh document). */
export function resetHistory<T>(value: T, label?: string): History<T> {
  return createHistory(value, label);
}

export function undoHistory<T>(h: History<T>): History<T> {
  return canUndo(h) ? { ...h, cursor: h.cursor - 1 } : h;
}

export function redoHistory<T>(h: History<T>): History<T> {
  return canRedo(h) ? { ...h, cursor: h.cursor + 1 } : h;
}

/** Move the present to any recorded entry without truncating the timeline. */
export function jumpTo<T>(h: History<T>, index: number): History<T> {
  if (index < 0 || index >= h.entries.length || index === h.cursor) return h;
  return { ...h, cursor: index };
}
