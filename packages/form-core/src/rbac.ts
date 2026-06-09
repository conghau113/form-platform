import type { FieldNode } from "@org/form-schema";

export interface AccessContext {
  roles: string[];
}

/** Field-level visibility by role. Undefined/empty = visible to everyone. */
export function canView(node: FieldNode, ctx: AccessContext): boolean {
  const roles = (node as any).permissions?.viewRoles as string[] | undefined;
  if (!roles || roles.length === 0) return true;
  return roles.some((r) => ctx.roles.includes(r));
}

/** Field-level editability by role. Undefined/empty = editable by everyone. */
export function canEdit(node: FieldNode, ctx: AccessContext): boolean {
  const roles = (node as any).permissions?.editRoles as string[] | undefined;
  if (!roles || roles.length === 0) return true;
  return roles.some((r) => ctx.roles.includes(r));
}
