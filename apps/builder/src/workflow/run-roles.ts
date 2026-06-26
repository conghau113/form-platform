import type { WorkflowDefinition } from "@org/workflow-schema";

/**
 * The distinct domain roles a workflow gates transitions on, in definition order (WF4a Run view).
 *
 * A transition's optional `role` (e.g. "employee", "manager", "hr") is checked by the engine against
 * the roles the actor holds — `advance` allows it only when `roles.includes(transition.role)`. The
 * Run view surfaces these as an "Acting as" picker so the operator declares the capacity they act in;
 * the chosen roles are sent as `opts.roles` on advance. The server is still authoritative: it merges
 * the actor's project role and re-evaluates guards/roles, so this list is purely the menu of roles
 * the operator may claim, never an access grant.
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
