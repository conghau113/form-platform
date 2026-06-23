import { dedupeFieldNames } from "@org/form-ai";
import type { FieldNode, FormSchema } from "@org/form-schema";

/**
 * diff.ts — pure helpers for the human-in-the-loop "review before accept" step.
 *
 * `diffForms` summarises how an AI proposal differs from the working form (by
 * field name across the whole tree) so the user sees what changes before it
 * touches the canvas. `appendForms` is the non-destructive accept path: it
 * concatenates the proposal's fields onto the current form and de-duplicates
 * colliding names (reusing the same `dedupeFieldNames` the generation pipeline
 * applies), so accepting "append" never silently overwrites a field's value.
 */

export interface FormDiff {
  /** Field names present in the proposal but not the current form. */
  added: string[];
  /** Field names present in the current form but not the proposal (lost on Replace). */
  removed: string[];
  /** Field names present in both. */
  kept: string[];
  currentCount: number;
  proposedCount: number;
}

/** Every named field reachable in the tree (containers + array item fields). */
function fieldNames(form: FormSchema): string[] {
  const out: string[] = [];
  const walk = (nodes: readonly FieldNode[]): void => {
    for (const node of nodes) {
      if ("name" in node && node.name) out.push(node.name);
      const obj = node as unknown as { children?: FieldNode[]; itemFields?: FieldNode[] };
      if (Array.isArray(obj.children)) walk(obj.children);
      if (Array.isArray(obj.itemFields)) walk(obj.itemFields);
    }
  };
  walk(form.fields);
  return out;
}

/** Summarise the change a proposal would make to the current form. */
export function diffForms(current: FormSchema, proposed: FormSchema): FormDiff {
  const currentNames = fieldNames(current);
  const proposedNames = fieldNames(proposed);
  const currentSet = new Set(currentNames);
  const proposedSet = new Set(proposedNames);
  // Names can repeat across subtrees (row-scoped `itemFields`), so de-duplicate
  // the displayed sets — the counts stay as the true reachable-field totals.
  const uniq = (names: string[]) => [...new Set(names)];
  return {
    added: uniq(proposedNames.filter((n) => !currentSet.has(n))),
    removed: uniq(currentNames.filter((n) => !proposedSet.has(n))),
    kept: uniq(proposedNames.filter((n) => currentSet.has(n))),
    currentCount: currentNames.length,
    proposedCount: proposedNames.length,
  };
}

/**
 * Append the proposal's top-level fields onto the current form, keeping the
 * current form's id/title/settings. Colliding names are suffixed (`email` →
 * `email_2`) so no existing field is shadowed. Pure — returns a new form.
 */
export function appendForms(current: FormSchema, proposed: FormSchema): FormSchema {
  const merged: FormSchema = { ...current, fields: [...current.fields, ...proposed.fields] };
  return dedupeFieldNames(merged);
}
