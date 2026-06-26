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
