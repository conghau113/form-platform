import type { WorkflowDefinition } from "@org/workflow-schema";

/**
 * The distinct domain roles a workflow gates transitions on, in definition order.
 *
 * A transition's optional `role` (e.g. "employee", "manager", "hr") is checked by the engine against
 * the roles the actor holds — `advance` allows it only when `roles.includes(transition.role)`. Those
 * roles are derived entirely by the SERVER (Phase E3a: project role + workspace roles + the case's
 * cast); a client cannot declare them, and this list grants nothing.
 *
 * Its one job now is to SUGGEST role codes in the Run view's cast picker, so casting someone into
 * "manager" is a click rather than a guess at spelling. Free text is still accepted there, because a
 * form's `viewRoles` may name a role the graph never mentions.
 *
 * Dedupes while preserving first-appearance order (mirrors {@link runActions}). Transitions without a
 * `role` contribute nothing — a workflow with no role-gated transitions yields `[]`.
 */
export function workflowRoles(def: WorkflowDefinition): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const t of def.transitions) {
    if (t.role && !seen.has(t.role)) {
      seen.add(t.role);
      roles.push(t.role);
    }
  }
  return roles;
}
