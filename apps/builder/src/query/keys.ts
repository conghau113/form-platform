/**
 * Query-key factory — the single source of truth for every react-query cache key in the builder.
 * Centralising them keeps invalidation honest: a mutation invalidates `qk.projects` (etc.) rather
 * than re-typing a string array that can drift out of sync with the query that reads it.
 */
export const qk = {
  projects: ["projects"] as const,
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
  submission: (id: string) => ["submissions", id] as const,
} as const;
