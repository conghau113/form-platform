# Workflow track — from prototype island to real feature

The workflow **contract** (`@org/workflow-schema`) and **engine** (`@org/workflow-core`) already
exist and are tested (commit a057961): versioned `WorkflowDefinition`/`WorkflowInstance`, JSONLogic
guards, `advance()` with role/guard branching, `validateGraph()`, `migrateWorkflow()`. The builder
also ships an xyflow `WorkflowEditor`. **What is missing is everything that makes it usable**: it is
an island.

## Current state (audited 2026-06-21)
- **`packages/workflow-schema`** ✅ contract + migrate + version. Done.
- **`packages/workflow-core`** ✅ pure `advance`/`availableTransitions`/`createInstance` +
  `validateGraph`. Done.
- **`apps/builder/src/workflow/`** — `WorkflowEditor.tsx` (xyflow canvas + node/edge side panels),
  `workflow-model.ts` (`toFlow`/`fromFlow` boundary, like form-model). BUT:
  - Seeds from `examples/workflow.v1.json`; the only output is **Export-JSON-download**. No load,
    no save, no persistence.
  - Node→form binding is a **free-text `formId` Input** — not a picker over real workspace forms.
  - Reachable only via the legacy `App.tsx` `mode` toggle (`"form" | "workflow"`), which the
    react-router workspace (Track W2.1 `ProjectWorkspace`/`ExplorerRail`) does NOT surface. So in
    the real app you basically can't get to it.
- **`apps/api`** — NO workflow module. Prisma has NO workflow model. Only an aspirational comment
  in `app.module.ts`.

## Goal
Make workflow a first-class workspace object alongside forms: create/list/open/save workflows inside
a project, bind states to **real** forms from that project, and (stretch) run a case end-to-end.

## Non-negotiables (same as the rest of the repo)
- The workflow JSON contract stays pure — org metadata (projectId/folderId/title index) lives in the
  DB, exactly like `FormRecord` vs `FormSchema`. **No `workflowVersion` bump** in WF0/WF1 (no shape
  change; engine/contract already current).
- api services depend on a `WorkflowRepo` **interface**, never on Prisma directly (D4).
- Access control reuses `ProjectsService.requireAccess(userId, projectId, minRole)` — viewer to read,
  editor to write, identical to forms/themes/presets.
- `migrateWorkflow()` is the save gate (validates + normalizes) — mirror `FormsService.save`’s
  `migrate()` gate. Never persist unvalidated JSON.
- Definition-of-done per phase: typecheck + tests + biome clean + changeset for any changed package;
  reviewer subagent before commit; then STOP (owner gates next phase).

---

## WF0 — Persistence foundation (api + prisma)  [no UI]
Mirror the forms module exactly.

- **prisma**: add `WorkflowRecord { id @id, projectId, folderId?, title, status?, body Json,
  updatedAt }` + relations on `Project` (`workflows WorkflowRecord[]`) and `Folder`
  (`workflows WorkflowRecord[]`, `onDelete: SetNull`). `@@index([projectId, folderId])`. New
  migration `*_workflow_records` (table + indexes only; no backfill).
- **repo interface** `persistence/repositories/workflow.repo.ts`: `WorkflowRepo` abstract class +
  `WorkflowUpsertMeta`/`WorkflowListQuery`/`WorkflowSummary` (clone of `form.repo.ts`, body typed
  as `WorkflowDefinition`).
- **prisma impl** `persistence/prisma/prisma-workflow.repo.ts` (clone of `prisma-form.repo.ts`).
  Register the binding in `persistence.module.ts`.
- **module** `modules/workflows/`:
  - `workflows.service.ts` — `save` (`migrateWorkflow` gate + `assertId` + `resolvePlacement` with
    `requireAccess(editor)`), `load`/`list` (viewer), `move`/`remove` (editor). Copy the forms
    service structure verbatim, swap `migrate`→`migrateWorkflow`.
  - `workflows.controller.ts` — `GET/POST /workflows`, `GET/DELETE/PATCH /workflows/:id`,
    `GET /workflows?projectId=&folderId=` list, all `@CurrentOwner`. DTO for the move body
    (`move-workflow.dto.ts`, class-validator) like `move-form.dto.ts`.
  - `workflows.module.ts`; register in `app.module.ts`.
- **tests**: `workflows.service` / controller e2e mirroring the forms tests (save→load round-trip,
  list by project/folder, access 404/403, invalid body 400, move within project).
- changeset for `@app/api`. (No package contract change.)

## WF1 — Builder workspace integration  [the part that makes it real]
- **data layer** (house style: `fetch` only in `client.ts`, react-query hooks):
  - `workflow/client.ts` — typed calls to the WF0 endpoints (ownerHeaders like presets/workspace).
  - `workflow/useWorkflows.ts` — `useWorkflows(projectId)` list query, `useSaveWorkflow` mutation
    (invalidate), `useWorkflow(id)` load query. Mirror `useFormPersistence`/workspace hooks.
- **WorkflowEditor**: drop the example seed + export-only flow. Load by `workflowId` (or start blank
  for a new one), Save persists via the mutation, title/id come from the record. Keep `validateGraph`
  pre-save (block save on errors, surface them). `fromFlow`/`toFlow` already do the boundary.
- **real form binding**: replace the free-text `formId` Input in `NodePanel` with a Select populated
  from the **project’s** forms (reuse `useProjectTree` / form summaries). Store the chosen form id;
  "Edit form" opens that form in the editor route. Optionally show the form title.
- **workspace surfacing**: list workflows in the project Explorer (ExplorerRail/ProjectWorkspace)
  next to forms; "New workflow" action; route `/projects/:projectId/workflows/:workflowId/edit`
  embedding the editor (mirror `EditorRoute` for forms). Unsaved-changes guard like the form editor.
- Retire / repurpose the legacy `App.tsx` `mode` toggle path (keep standalone-renderable if cheap).
- **tests**: pure-unit for any new helper; hook/render tests for save/load + form-picker; keep
  builder suite green. Builder is private → no changeset.

## WF2 — Runtime / instances (STRETCH, separate plan)  [end-to-end value]
The engine already runs; this is persistence + a thin UI.
- prisma `WorkflowInstanceRecord` (or reuse) + `WorkflowInstanceRepo`; api `createInstance` +
  `advance` endpoints (engine does the logic; api just loads def+instance, calls `advance`, persists).
- A "Run" view: render the bound form (via `@org/form-renderer-web`) at the current state, show
  available actions, fire one, persist the advanced instance, show history. This is where forms +
  workflow finally meet at runtime.
- Likely its own multi-phase plan; do NOT bundle into WF0/WF1.

## WF3 — Parity polish (later)
Sharing/roles already come free via `ProjectMember` (WF0 reuses `requireAccess`). Possible later:
i18n of status/action labels (reuse the i18n pattern), workflow templates, native parity. Defer.

## Recommended slice order
**WF0 → WF1**, each its own commit + reviewer + STOP. WF2 (runtime) is the high-value follow-up but
deserves its own plan. WF0 is low-risk (pure clone of a proven module); WF1 is where the design
judgement (workspace routing, form picker) lives.
