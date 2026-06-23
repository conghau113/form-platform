import type { WorkflowDefinition } from "@org/workflow-schema";

/**
 * diff.ts — pure helper for the "review before accept" step of workflow generation.
 *
 * Unlike forms (where you can append fields), a workflow is one cohesive state machine, so an
 * AI proposal always REPLACES the current graph. `diffWorkflows` therefore produces an
 * informational summary — which state labels appear/disappear and how the state/transition
 * counts change — so the user understands the shape of the change before it swaps the canvas.
 *
 * States are compared by their human-meaningful `status` label (the AI invents fresh node ids,
 * so id-level diffing would be pure noise). Counts use the true totals.
 */

export interface WorkflowDiff {
  /** State labels in the proposal but not the current workflow. */
  addedStates: string[];
  /** State labels in the current workflow but not the proposal (lost on replace). */
  removedStates: string[];
  /** State labels present in both. */
  keptStates: string[];
  currentStateCount: number;
  proposedStateCount: number;
  currentTransitionCount: number;
  proposedTransitionCount: number;
  /** The `status` label of the proposal's start node (empty if it has none). */
  proposedStart: string;
}

/** All `status` labels of a definition's nodes, in node order. */
function statusLabels(def: WorkflowDefinition): string[] {
  return def.nodes.map((n) => n.status);
}

/** Summarise the change an AI proposal would make to the current workflow. */
export function diffWorkflows(
  current: WorkflowDefinition,
  proposed: WorkflowDefinition,
): WorkflowDiff {
  const currentLabels = statusLabels(current);
  const proposedLabels = statusLabels(proposed);
  const currentSet = new Set(currentLabels);
  const proposedSet = new Set(proposedLabels);
  // A workflow can in principle repeat a status label across nodes, so de-duplicate the
  // displayed sets while keeping the counts as true node totals.
  const uniq = (labels: string[]) => [...new Set(labels)];
  const startNode = proposed.nodes.find((n) => n.id === proposed.start);
  return {
    addedStates: uniq(proposedLabels.filter((s) => !currentSet.has(s))),
    removedStates: uniq(currentLabels.filter((s) => !proposedSet.has(s))),
    keptStates: uniq(proposedLabels.filter((s) => currentSet.has(s))),
    currentStateCount: current.nodes.length,
    proposedStateCount: proposed.nodes.length,
    currentTransitionCount: current.transitions.length,
    proposedTransitionCount: proposed.transitions.length,
    proposedStart: startNode?.status ?? "",
  };
}
