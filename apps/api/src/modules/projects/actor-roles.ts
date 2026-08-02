import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";

/**
 * Role codes the PLATFORM owns, so a client-created `Role` may never mint them (product-roadmap
 * Phase E3a).
 *
 * `owner` / `editor` / `viewer` are emitted from the caller's project role, `assignee` is derived
 * from `WorkflowInstanceRecord.assigneeId` and `creator` is written by `start()`. Nothing stops a
 * tenant admin from creating a `Role` literally named `assignee` or `editor` — `RbacRepo.createRole`
 * accepts any name — and without this list everyone holding that role would satisfy a
 * `transition.role: "assignee"` guard and unlock every field gated on `viewRoles: ["editor"]` across
 * the tenant. That would re-open, through the back door, exactly the escalation E3a exists to close.
 *
 * Filtering is EXACT (after trimming), not case-insensitive, because the engine's own check is exact
 * — `advance` tests `roles.includes(transition.role)` and `canView` tests the same way, so a role
 * named `Assignee` satisfies nothing and needs no filtering, while a client role legitimately named
 * `Editor` keeps working. If either comparison ever becomes case-insensitive, this must follow.
 */
export const RESERVED_ROLE_CODES = ["owner", "editor", "viewer", "assignee", "creator"];

/** Whether a name collides with a platform-owned role code — see {@link RESERVED_ROLE_CODES}. */
export function isReservedRoleCode(name: string): boolean {
  return RESERVED_ROLE_CODES.includes(name.trim());
}

/**
 * The domain roles a user acts in on one PROJECT, as the server derives them (Phase E3a): their
 * project role verbatim, plus the names of the tenant `Role`s they hold, minus the reserved codes.
 *
 * Project roles are emitted as the bare strings `owner|editor|viewer` on purpose — workflow
 * definitions already in use gate transitions on `role: "editor"`, and renaming them here would
 * silently stall those cases. Pure: no DB, no request state, deduped, order-stable.
 */
export function projectActorRoles(
  projectRole: ProjectRole | null,
  tenantRoleNames: string[],
): string[] {
  const roles = new Set<string>();
  if (projectRole) roles.add(projectRole);
  for (const name of tenantRoleNames) {
    const code = name.trim();
    if (code.length === 0 || isReservedRoleCode(code)) continue;
    roles.add(code);
  }
  return [...roles];
}
