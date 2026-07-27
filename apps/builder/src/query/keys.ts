/**
 * Query-key factory — the single source of truth for every react-query cache key in the builder.
 * Centralising them keeps invalidation honest: a mutation invalidates `qk.projects` (etc.) rather
 * than re-typing a string array that can drift out of sync with the query that reads it.
 */
export const qk = {
  // Current authenticated session (2B): the `/auth/me` probe that drives the auth gate.
  me: ["auth", "me"] as const,
  // The session's effective function codes (D1): drives nav gating + the admin surface.
  myFunctions: ["auth", "my-functions"] as const,
  // RBAC admin data (D1): the platform function catalog, tenant roles, tenant members.
  rbacFunctions: ["rbac", "functions"] as const,
  rbacRoles: ["rbac", "roles"] as const,
  rbacUsers: ["rbac", "users"] as const,
  // Tenant-wide admin catalog (D2–D4): every form/workflow/version/case in the caller's tenant.
  adminForms: ["admin", "forms"] as const,
  adminWorkflows: ["admin", "workflows"] as const,
  adminFormVersions: ["admin", "form-versions"] as const,
  adminInstances: ["admin", "workflow-instances"] as const,
  projects: ["projects"] as const,
  // The user's tenant memberships (B4): powers the New-project workspace picker.
  myTenants: ["tenants", "mine"] as const,
  projectTree: (projectId: string) => ["projects", projectId, "tree"] as const,
  presets: (projectId?: string) => ["presets", projectId ?? null] as const,
  form: (formId: string) => ["forms", formId] as const,
  theme: (formId: string) => ["themes", formId] as const,
  workflows: (projectId: string) => ["workflows", "list", projectId] as const,
  workflow: (id: string) => ["workflows", "item", id] as const,
  instances: (workflowId: string) => ["workflows", "instances", workflowId] as const,
  instance: (id: string) => ["workflow-instances", id] as const,
  statusCatalog: (projectId?: string) => ["status-catalog", projectId ?? null] as const,
  submissions: (formId: string) => ["forms", "submissions", formId] as const,
  // `roles` is part of the key: changing the reader's declared roles (FS2) re-fetches, since the
  // server masks fields the reader can't view differently per role set.
  submission: (id: string, roles: string[] = []) => ["submissions", id, roles] as const,
  // Form publish/version history (FB1): the list, one frozen version, and the active published one.
  versions: (formId: string) => ["forms", "versions", formId] as const,
  version: (formId: string, version: number) => ["forms", "versions", formId, version] as const,
  activeVersion: (formId: string) => ["forms", "active-version", formId] as const,
} as const;
