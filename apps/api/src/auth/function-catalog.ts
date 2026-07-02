import type { FunctionSeed } from "../persistence/repositories/rbac.repo.js";

/**
 * The platform's immutable base function catalog (product-roadmap Phase C1/C5). These stable codes are
 * seeded (idempotent upsert) at boot so enforcement always has a catalog and upgrades stay safe. Keep
 * codes **stable** — clients grant them to roles; renaming/removing one breaks live grants. New base
 * codes are added here; client-defined functions are a later, additive slice. The `*` superadmin
 * sentinel is not listed (it is granted directly to a tenant's admin role, never a gate target).
 */
export const BASE_FUNCTIONS: FunctionSeed[] = [
  { code: "form.read", name: "View forms" },
  { code: "form.manage", name: "Create / edit forms" },
  { code: "version.publish", name: "Publish form versions", parentCode: "form.manage" },
  { code: "workflow.read", name: "View workflows" },
  { code: "workflow.manage", name: "Create / edit workflows" },
  { code: "workflow.run", name: "Run workflow tickets" },
  { code: "submission.read", name: "View submissions" },
  { code: "submission.manage", name: "Manage submissions" },
  { code: "org.admin", name: "Manage org units" },
  { code: "role.admin", name: "Manage roles & permissions" },
  { code: "user.admin", name: "Manage users & assignments" },
];
