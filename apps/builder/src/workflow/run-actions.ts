import { availableTransitions } from "@org/workflow-core";
import type { WorkflowDefinition } from "@org/workflow-schema";

/**
 * The distinct actions a runner can fire from `current`, in definition order (WF3b Run view).
 *
 * `availableTransitions` returns one transition per edge, but several edges can share an `action`
 * (guard-based branching: the engine picks the first whose role + guard pass). The Run view shows
 * ONE button per action, so this dedupes by `action` while preserving first-appearance order. The
 * server is authoritative — it re-evaluates guards/roles on advance — so the button set is purely
 * presentational and never gates which transition actually fires.
 */
export function runActions(def: WorkflowDefinition, current: string): string[] {
  const seen = new Set<string>();
  const actions: string[] = [];
  for (const t of availableTransitions(def, current)) {
    if (!seen.has(t.action)) {
      seen.add(t.action);
      actions.push(t.action);
    }
  }
  return actions;
}

/**
 * Whether a state is terminal — has no outgoing transition, so a case sitting on it is **done** and
 * can advance no further (#3 run-list filter). Structural (graph-only), independent of case data, so
 * the launcher can partition the case list active/done from the workflow `def` + each summary's
 * `current` with no server round-trip. Mirrors {@link runActions} returning `[]` for a terminal state.
 */
export function isTerminalState(def: WorkflowDefinition, stateId: string): boolean {
  return availableTransitions(def, stateId).length === 0;
}

/**
 * The localized DISPLAY label for an action id (WF4b). `action` is the engine identifier, so it is
 * never mutated — the label lives in a transition's `i18n.action` map and is resolved here for
 * display only (the Run view still fires the raw id). Returns the first matching transition's
 * localized label, falling back to `fallback`, then the raw `action` id. No `locale` ⇒ the id, so
 * this is a no-op for non-localized workflows.
 */
export function actionLabel(
  def: WorkflowDefinition,
  action: string,
  locale?: string,
  fallback?: string,
): string {
  if (locale) {
    for (const t of def.transitions) {
      const byLocale = t.action === action ? t.i18n?.action : undefined;
      if (byLocale) {
        const translated = byLocale[locale] ?? (fallback ? byLocale[fallback] : undefined);
        if (translated !== undefined) return translated;
      }
    }
  }
  return action;
}
