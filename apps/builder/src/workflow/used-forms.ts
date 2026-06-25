/**
 * Pure workflow-scoped view of the forms a workflow uses: from `nodes[].formId`, group the states
 * by the form they bind, resolve each form's title from the project's form list, and flag forms
 * whose id no longer exists in the project (bound but deleted). No React, no xyflow — unit-tested
 * on plain objects. Presentation/aggregation only; the node→formId relationship already lives in
 * the contract, so this never touches the schema.
 */

/** Minimal node shape the aggregation needs (a WorkflowNode / FlowNode flat-data is assignable). */
export interface UsedFormNode {
  id: string;
  status: string;
  formId?: string;
}

/** A form available in the workflow's project (id + display title). */
export interface FormOption {
  id: string;
  title: string;
}

/** One bound form plus every state that uses it. */
export interface UsedForm {
  formId: string;
  /** Resolved project title; falls back to the id when the form is missing. */
  title: string;
  /** Bound on a node but no longer present in the project (deleted). */
  missing: boolean;
  /** States binding this form, in node order. A form may back several states. */
  states: { id: string; status: string }[];
}

export interface UsedFormsView {
  /** Distinct bound forms, ordered by first appearance among the nodes. */
  forms: UsedForm[];
  /** States with no form bound — the gaps a workflow author should fill. */
  unbound: { id: string; status: string }[];
}

/** Group a workflow's states by their bound form, resolving titles + missing status from the
 *  project's form list. Order is first-appearance (stable as nodes are added). */
export function usedForms(
  nodes: readonly UsedFormNode[],
  options: readonly FormOption[],
): UsedFormsView {
  const titleById = new Map(options.map((o) => [o.id, o.title]));
  const byForm = new Map<string, UsedForm>();
  const unbound: { id: string; status: string }[] = [];

  for (const n of nodes) {
    if (!n.formId) {
      unbound.push({ id: n.id, status: n.status });
      continue;
    }
    const existing = byForm.get(n.formId);
    if (existing) {
      existing.states.push({ id: n.id, status: n.status });
      continue;
    }
    const title = titleById.get(n.formId);
    byForm.set(n.formId, {
      formId: n.formId,
      title: title ?? n.formId,
      missing: title === undefined,
      states: [{ id: n.id, status: n.status }],
    });
  }

  return { forms: [...byForm.values()], unbound };
}
