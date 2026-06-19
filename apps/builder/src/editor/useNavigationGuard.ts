import type { DesignTokens } from "@org/form-theme";
import { useCallback, useEffect, useRef } from "react";

export interface NavigationGuardArgs {
  /** Current history cursor. */
  historyIndex: number;
  /** History cursor at the last load/save. */
  savedIndex: number;
  /** Current design tokens. */
  tokens: DesignTokens;
  /** Design tokens at the last load/save. */
  savedTokens: DesignTokens;
  /** The save round-trip; the guard wraps it in a stable fn so it can "save then proceed". */
  onSave: () => Promise<boolean>;
  /** Reports unsaved-changes state to the workspace shell. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Hands a stable save fn up so the router-level guard can save without stale closures. */
  provideSave?: (save: () => Promise<boolean>) => void;
}

/** Wires the unsaved-changes machinery: the dirty signal (form tree moved past its saved
 *  cursor OR design tokens changed — both are persisted together, so neither is silently lost),
 *  the `onDirtyChange` report, a stable `provideSave`, and the native refresh/close prompt.
 *  Extracted from `App` in refactor R3; the `latestSave` ref is preserved so the guard never
 *  calls a stale snapshot of the current json/tokens. */
export function useNavigationGuard({
  historyIndex,
  savedIndex,
  tokens,
  savedTokens,
  onSave,
  onDirtyChange,
  provideSave,
}: NavigationGuardArgs): void {
  // Dirty = the form tree moved past its saved cursor OR the design tokens changed (both are
  // persisted together by `onSave`), so neither form edits nor theme edits are silently lost.
  const dirty =
    historyIndex !== savedIndex || JSON.stringify(tokens) !== JSON.stringify(savedTokens);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Register ONE stable save fn that reads the latest closure via a ref — so the
  // navigation guard never calls a stale snapshot of the current json/tokens.
  const latestSave = useRef(onSave);
  latestSave.current = onSave;
  const stableSave = useCallback(() => latestSave.current(), []);
  useEffect(() => provideSave?.(stableSave), [provideSave, stableSave]);

  // Native browser prompt on refresh / tab close while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // some engines still require this for the native prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
