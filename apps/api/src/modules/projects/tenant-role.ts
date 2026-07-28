import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import type { ScopedGrant } from "../../persistence/repositories/rbac.repo.js";
import { WILDCARD_FUNCTION } from "../../persistence/repositories/rbac.repo.js";

/**
 * Coarse mapping from a user's effective RBAC functions in a tenant (Phase C) to the Track-W
 * project role they hold on that tenant's projects (B3). Data-driven per §1.1: a member's access
 * follows the roles a client admin assigned — a member with no roles sees nothing. Per-resource
 * granularity (e.g. `form.read` gating only forms) is Phase C3 data-scope; here any manage-level
 * grant confers `editor` and any read-level grant confers `viewer` across the whole project.
 */
const EDITOR_FUNCTIONS = ["form.manage", "workflow.manage", "submission.manage", "version.publish"];
const VIEWER_FUNCTIONS = ["form.read", "workflow.read", "submission.read", "workflow.run"];

/** The project role a set of tenant functions confers, or `null` for no access. */
export function projectRoleFromFunctions(functions: string[]): ProjectRole | null {
  if (functions.includes(WILDCARD_FUNCTION)) return "owner";
  if (EDITOR_FUNCTIONS.some((code) => functions.includes(code))) return "editor";
  if (VIEWER_FUNCTIONS.some((code) => functions.includes(code))) return "viewer";
  return null;
}

/**
 * The project role a user's scoped grants confer on one project (Phase C3 data-scope). A grant applies
 * to the project when it is **tenant-wide** (no data-scope org units) or when one of its scoped org
 * units is an ancestor-or-self of the project's org unit (i.e. the project sits in that subtree —
 * `projectAncestorIds` is that self+ancestor set, empty when the project has no org unit). The
 * applicable grants' functions are unioned, then mapped by {@link projectRoleFromFunctions}. A role
 * scoped away from the project contributes nothing; the tenant admin (`*`, unscoped) still reaches all.
 */
export function projectRoleFromScopedGrants(
  grants: ScopedGrant[],
  projectAncestorIds: Set<string>,
): ProjectRole | null {
  const effective = new Set<string>();
  for (const grant of grants) {
    const applies =
      grant.scopeOrgUnitIds.length === 0 ||
      grant.scopeOrgUnitIds.some((id) => projectAncestorIds.has(id));
    if (applies) for (const code of grant.functions) effective.add(code);
  }
  return projectRoleFromFunctions([...effective]);
}

/** Whether any grant is scoped (has data-scope org units) — the chokepoint only needs the org tree
 *  when a scoped grant might apply to a placed project, so this gates that extra lookup. */
export function hasScopedGrant(grants: ScopedGrant[]): boolean {
  return grants.some((g) => g.scopeOrgUnitIds.length > 0);
}

/**
 * The self + ancestor org-unit ids of `startId` within a flat unit list (Phase C3). Walks `parentId`
 * upward; tolerates a missing start or a broken/cyclic chain (stops on repeat). Returns an empty set
 * when `startId` is null (an unplaced project). Pure — no DB, no eval.
 */
export function collectAncestors(
  units: { id: string; parentId: string | null }[],
  startId: string | null,
): Set<string> {
  const ancestors = new Set<string>();
  if (!startId) return ancestors;
  const byId = new Map(units.map((u) => [u.id, u]));
  let current: string | null = startId;
  while (current && !ancestors.has(current)) {
    ancestors.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return ancestors;
}
