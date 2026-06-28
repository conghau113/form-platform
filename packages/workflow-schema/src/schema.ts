import { z } from "zod";
import { STATUS_KINDS } from "./status-catalog.js";

/**
 * The CURRENT workflow format version.
 * IMPORTANT: decoupled from the npm package version, exactly like
 * CURRENT_FORM_VERSION / CURRENT_THEME_VERSION. Bump this ONLY when the workflow
 * JSON shape changes, and add a migration in migrate.ts so older saved
 * definitions keep loading. The package version changes on every code release.
 */
export const CURRENT_WORKFLOW_VERSION = 1 as const;

/**
 * A transition guard. The `rule` is a plain JSONLogic expression evaluated by a
 * SAFE evaluator in workflow-core — the same shape as form-schema's
 * conditionSchema. NEVER eval() these rules.
 */
export const guardSchema = z.object({
  rule: z.record(z.string(), z.any()),
});

/** Localized text overrides, keyed `attribute → locale → string` (the same shape as
 *  form-schema's `i18nMapSchema`). Resolved for one locale by `localizeWorkflow` in
 *  workflow-core. An absent map means "use the authored default string", so old JSON keeps
 *  parsing and runtime is unchanged when no locale is requested. Additive/optional. */
export const i18nMapSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type I18nMap = z.infer<typeof i18nMapSchema>;

/** Neutral canvas coordinates. This is the ONLY presentation data in the
 *  contract; concrete editor internals (xyflow node fields) stay at the boundary,
 *  exactly as dnd-kit `uid` stays out of FormSchema. */
export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** A state in the workflow. `status` is the human state label (e.g. "created");
 *  `formId` references a form (by id) bound to this state.
 *
 *  WE4 status catalog (additive — old definitions without these keys keep parsing, so NO
 *  workflowVersion bump): `statusCode` references a {@link StatusCatalogEntry} in the project's
 *  status catalog (master data, OUTSIDE this contract). `kind` is a frozen snapshot of that
 *  entry's engine category, so the node's colour survives a deleted catalog entry — `status`
 *  likewise stays as the frozen label snapshot (same denorm fallback as form-schema linked
 *  fields). The catalog is the source of truth when resolvable; these node fields are the
 *  fallback. NEVER store a raw colour here — colour resolves from `kind`/the catalog entry. */
export const workflowNodeSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  formId: z.string().optional(),
  position: positionSchema.optional(),
  kind: z.enum(STATUS_KINDS).optional(),
  statusCode: z.string().min(1).optional(),
  /** Localized overrides of this node's display text (`status`). See {@link i18nMapSchema}.
   *  Additive: old JSON without this key keeps parsing, so no workflowVersion bump. */
  i18n: i18nMapSchema.optional(),
});

/** A directed edge between states. `action` is the event that triggers it; an
 *  optional `guard` (JSONLogic) and `role` gate whether it may fire. */
export const workflowTransitionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  action: z.string().min(1),
  guard: guardSchema.optional(),
  role: z.string().optional(),
  /** Localized overrides of this transition's display LABEL, under the `action` attribute.
   *  `action` itself stays the engine identifier (never localized); the label is resolved for
   *  display only. See {@link i18nMapSchema}. Additive/optional. */
  i18n: i18nMapSchema.optional(),
});

/**
 * A workflow DEFINITION — the versioned template. Nodes reference forms by id;
 * `start` names the entry node. This is what the editor exports and the engine
 * reads. Kept separate from a running instance below.
 */
export const workflowDefinitionSchema = z.object({
  workflowVersion: z.number().int(),
  id: z.string(),
  title: z.string(),
  start: z.string().min(1),
  nodes: z.array(workflowNodeSchema),
  transitions: z.array(workflowTransitionSchema),
  /** Localized overrides of the workflow's own text (currently `title`), e.g.
   *  `{ title: { vi: "…" } }`. See {@link i18nMapSchema}. Additive/optional. */
  i18n: i18nMapSchema.optional(),
  /** Locale the authored strings are written in (the implicit default for every node's `i18n`).
   *  The Run view uses it as the default `fallbackLocale` and seeds its language switcher.
   *  Additive/optional. */
  defaultLocale: z.string().optional(),
  /** Extra locales this workflow offers translations for — drives the Run view's language
   *  switcher. The authored default locale is implicit (not listed here). Additive/optional. */
  locales: z.array(z.string()).optional(),
});

/** One advance recorded on an instance's history. */
export const historyEntrySchema = z.object({
  from: z.string(),
  to: z.string(),
  action: z.string(),
  at: z.string(),
});

/**
 * A running INSTANCE (case) of a definition. It pins `definitionVersion` so the
 * engine always advances it against the template shape it was started on, even
 * after the definition evolves.
 */
export const workflowInstanceSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  definitionVersion: z.number().int(),
  current: z.string(),
  data: z.record(z.string(), z.unknown()),
  history: z.array(historyEntrySchema),
});

export type Guard = z.infer<typeof guardSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type WorkflowInstance = z.infer<typeof workflowInstanceSchema>;
