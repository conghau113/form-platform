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
  /** E1 — who this state is EXPECTED to land on, as authored on the template.
   *
   *  A SUGGESTION, NEVER A PERMISSION. `transition.role` is the only thing the engine checks the
   *  ACTOR against (`advance` in workflow-core; a guard gates on case DATA, not on identity), and
   *  this field is not consulted at all — so it stops nobody, and reading it as access control
   *  would be a security hole in the reader, not in the graph. It is named `defaultAssignee` rather
   *  `assignee` precisely because the RUNNING case already has an `assigneeId` (whoever actually
   *  claimed it) — this is the default that feeds it, not a mirror of it.
   *
   *  `kind: "role"` names a domain role (the same vocabulary `transition.role` uses); `kind: "user"`
   *  names a user id — never a display name, so a renamed user isn't frozen into the definition.
   *
   *  Additive/optional ⇒ NO workflowVersion bump (same character as `i18n`/`statusCode`/`kind`).
   *
   *  ⚠️ Do NOT use `defaultAssignee` as a key inside this node's `i18n` map: `localizeWorkflow`
   *  overwrites any attribute named there with the translated STRING, which would replace this
   *  object. Only text attributes (`status`) belong in `i18n`. */
  defaultAssignee: z
    .object({
      kind: z.enum(["role", "user"]),
      value: z.string().min(1),
    })
    .optional(),
  /** E2 — marks this node as a parallel-flow gateway rather than a state someone works in.
   *
   *  `"fork"` splits the case into one token per outgoing transition; `"join"` parks arriving
   *  tokens until every sibling of the same fork run has arrived. The engine executes both (E3a).
   *
   *  ⚠️ A gateway's outgoing edges are traversed UNCONDITIONALLY — every edge out of a fork, and a
   *  join's single edge out once its last sibling arrives — so a `guard` or `role` placed on either
   *  would stop nobody. E4 validates that statically: a malformed gateway (a fork with one way out,
   *  a join without exactly one, a gated fork OR join edge, or a `start` that is itself a fork) is
   *  refused by `validateGraph` when the definition is saved, and by the engine again when someone
   *  runs the case (`invalid-gateway`). Both checks exist because a definition can be edited under a
   *  running case; they are two views of one rule set.
   *
   *  Orthogonal to `kind`: a
   *  fork is still a `kind: "normal"` node in the status catalog, which is why this is NOT folded
   *  into `STATUS_KINDS` (that tuple also types the master-data catalog and the `statusKind` column).
   *
   *  It sits on the NODE, not on the transition, so the editor's one-transition-one-edge mapping and
   *  its byte-exact save round-trip both stay intact — and so that a fork can become something the
   *  engine steps into, rather than a drawing with nothing behind it.
   *
   *  Additive/optional ⇒ NO workflowVersion bump (same character as `i18n`/`statusCode`/`kind`).
   *
   *  ⚠️ Do NOT use `gateway` as a key inside this node's `i18n` map — `localizeWorkflow` overwrites
   *  any attribute named there with the translated STRING, which would turn this into free text.
   *  Only text attributes (`status`) belong in `i18n`. */
  gateway: z.enum(["fork", "join"]).optional(),
});

/** A directed edge between states. `action` is the event that triggers it; an
 *  optional `guard` (JSONLogic) and `role` gate whether it may fire.
 *
 *  ⚠️ Except on an edge leaving a `gateway` node, which the engine traverses itself without asking
 *  either. Such an edge is refused outright (`fork-edge-gated` / `join-edge-gated`) rather than run
 *  with a gate that silently stops nobody — see the `gateway` note above. */
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
  /** Who fired the action (a user id) — the "ai đã làm" half of work-order tracking (Phase E).
   *  The engine only records it when the caller supplies one, so entries written before this key
   *  existed keep parsing and nothing about an anonymous advance changes. Additive/optional ⇒ NO
   *  workflowVersion bump (same character as `i18n`/`statusCode`). Never a display name: names are
   *  resolved at read time so a renamed user isn't frozen into history. */
  actor: z.string().optional(),
  /** E3a — WHICH token made this move (see {@link workflowTokenSchema}), not who: `actor` above is
   *  the person. On a case with no fork the two answers are equivalent and this key is noise; on a
   *  forked case it is the only thing that says which BRANCH a history entry belongs to, so a reader
   *  can tell "approved, then approved again" from "both branches approved once".
   *
   *  Written for the automatic steps a gateway takes too — a fork's outgoing edges are traversed by
   *  the engine, not fired by a person, and the entry carries the id of the token that traversal
   *  CREATED (or, where a root-scoped token merely walks through a join, its own id, because nothing
   *  was merged and so nothing is new). That is what makes the key answer a question `actor` cannot.
   *
   *  Additive/optional ⇒ NO workflowVersion bump (same character as `actor`). Entries written before
   *  this key existed keep parsing, and nothing about a single-token advance changes. */
  token: z.string().optional(),
});

/**
 * E2 — one place the case currently is. A case with a fork in its path stands in several places at
 * once, so "where is it" is a LIST of these rather than a single node id.
 *
 * `id` identifies the token itself (not the node), because two tokens can legitimately sit on the
 * same node — on a loop, or where two branches happen to meet — and an engine that cannot tell them
 * apart silently merges them into one, losing a branch. `at` is the node it is parked on. `scope`
 * names the fork RUN that produced it: the same fork traversed twice in a loop yields two different
 * scopes, so the two rounds never count toward each other's join.
 */
export const workflowTokenSchema = z.object({
  id: z.string().min(1),
  at: z.string().min(1),
  scope: z.string().min(1),
});

/**
 * E2 — what one fork RUN spawned, recorded so its join knows what it is waiting for.
 *
 * `expected` is how many tokens that run created (the fork's out-degree AT THE TIME IT RAN, which is
 * why it is stored rather than recomputed: the definition can be edited under a running case).
 * `parent` is the scope the consumed token belonged to — `null` at the outermost level — so nested
 * forks form a tree and an inner join settles without touching the outer one's tokens.
 */
export const workflowScopeSchema = z.object({
  forkNode: z.string().min(1),
  expected: z.number().int().positive(),
  parent: z.string().nullable(),
});

/**
 * E2 — the scope every case starts in, before any fork has run.
 *
 * It is IMPLICIT: it never appears as a key in an instance's `scopes`, because no fork created it,
 * so it has no `forkNode` and no meaningful `expected` — inventing values for those would store a
 * lie. Reserving the id here rather than only documenting it is what keeps a fork from generating a
 * run that is indistinguishable from "outermost".
 */
export const ROOT_SCOPE = "root" as const;

/**
 * A running INSTANCE (case) of a definition. It pins `definitionVersion` so the
 * engine always advances it against the template shape it was started on, even
 * after the definition evolves.
 */
export const workflowInstanceSchema = z.object({
  id: z.string(),
  definitionId: z.string(),
  definitionVersion: z.number().int(),
  /** Where the case is, as a SINGLE node id — since E3a, only the REPRESENTATIVE place.
   *
   *  It stays REQUIRED, and the engine keeps writing it alongside `tokens`, so a build that predates
   *  markings keeps reading this field and working. But reading it as "where the case is" reports
   *  one branch of a parallel case as though it were the whole case, and on a case that has passed
   *  a fork it names an arbitrary (if deterministic) branch. Read a marking through `readMarking`
   *  (workflow-core), which handles both eras. */
  current: z.string(),
  data: z.record(z.string(), z.unknown()),
  history: z.array(historyEntrySchema),
  /** E2 — the full marking: every place the case currently stands. ABSENT means the case was written
   *  by a build that had no notion of tokens; read it through `readMarking`, which turns that into
   *  the single token at `current`. Since E3a the engine writes this key on every case it creates or
   *  advances, so absent means a case that has not been touched since that landed.
   *
   *  `.min(1)` because an empty marking is not a state this model has: a finished case still has its
   *  token PARKED on the end node, and a cancelling join still emits the parent token. Zero tokens
   *  therefore only ever means a writer lost one.
   *
   *  ⚠️ This constraint is a CONTRACT, not a runtime fence — the API stores an instance body as
   *  opaque JSON and never parses it back through this schema, so nothing rejects a bad body at the
   *  boundary. Readers must not assume it held.
   *
   *  Additive/optional ⇒ NO workflowVersion bump. */
  tokens: z.array(workflowTokenSchema).min(1).optional(),
  /** E2 — the fork runs behind the tokens above, keyed by scope id.
   *
   *  ⚠️ Only FORK-CREATED scopes appear here. The outermost scope every case starts in has no entry,
   *  on purpose: no fork created it, so it has no `forkNode` and no meaningful `expected`, and
   *  inventing values for those would be a lie stored as data. So `scopes[token.scope] === undefined`
   *  is a normal answer — never assume a hit.
   *
   *  ⚠️ But it only means "outermost" when the scope IS {@link ROOT_SCOPE}. A run created by a fork
   *  and then retired by its join reads exactly the same way, and reading THAT as "outermost" is how
   *  a straggler walks through a join a second time and re-runs everything past it. For any other
   *  scope, missing means the run was retired or lost, and the engine treats it as an error
   *  (`invalid-gateway`) rather than as root.
   *
   *  Additive/optional ⇒ NO workflowVersion bump. */
  scopes: z
    .record(z.string(), workflowScopeSchema)
    .refine((scopes) => !(ROOT_SCOPE in scopes), {
      message: `"${ROOT_SCOPE}" is the implicit outermost scope and must not be given an entry`,
    })
    .optional(),
});

export type Guard = z.infer<typeof guardSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowTransition = z.infer<typeof workflowTransitionSchema>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type WorkflowToken = z.infer<typeof workflowTokenSchema>;
export type WorkflowScope = z.infer<typeof workflowScopeSchema>;
export type WorkflowInstance = z.infer<typeof workflowInstanceSchema>;
