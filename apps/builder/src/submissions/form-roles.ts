import { childrenOf, type FieldNode, type FormSchema } from "@org/form-schema";

/**
 * The distinct domain roles a form's fields gate on (`permissions.viewRoles`/`editRoles`), in
 * definition order. Mirrors {@link workflowRoles}: the Submissions view surfaces these as an
 * "Acting as" picker so a reader/submitter declares the capacity they act in. The server is still
 * authoritative — it merges the actor's project role and masks/strips fields server-side (FS2) — so
 * this list is purely the menu of roles the operator may claim, never an access grant. A form with
 * no role-gated field yields `[]` (and the picker is hidden). Recurses containers + array rows.
 */
export function formRoles(form: FormSchema): string[] {
  const seen = new Set<string>();
  const roles: string[] = [];
  const visit = (nodes: FieldNode[]): void => {
    for (const node of nodes) {
      const perms = (node as { permissions?: { viewRoles?: string[]; editRoles?: string[] } })
        .permissions;
      for (const role of [...(perms?.viewRoles ?? []), ...(perms?.editRoles ?? [])]) {
        if (!seen.has(role)) {
          seen.add(role);
          roles.push(role);
        }
      }
      const children = childrenOf(node);
      if (children) visit(children);
    }
  };
  visit(form.fields);
  return roles;
}
