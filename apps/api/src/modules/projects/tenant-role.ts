import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
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
