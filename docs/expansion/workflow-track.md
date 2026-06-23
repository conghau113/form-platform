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

## WF0 — Persistence foundation (api + prisma)  ✅ DONE (commit c4c1fbe, branch feat/workflow-wf0)
Mirror the forms module exactly. Shipped: `WorkflowRecord` prisma model + migration
`20260620171441_workflow_records` (table+index only, no backfill, no `workflowVersion` bump);
`WorkflowRepo` interface + `PrismaWorkflowRepo` (registered global); `modules/workflows/`
(service with `migrateWorkflow` save gate + Unfiled placement + `ProjectsService.requireAccess`
viewer-read/editor-write, controller GET/POST/PATCH-move/DELETE `@CurrentOwner`, `MoveWorkflowDto`);
wired in `app.module`; api gained `@org/workflow-schema` dep. 9 service tests. typecheck 15/15,
api 55/55, biome clean. Reviewer subagent unavailable (529 overloaded ×3) → reviewed inline instead.
Original plan below for reference.

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

## WF1 — Builder workspace integration  ✅ DONE (commit a99a91d, branch feat/workflow-wf0)
Shipped exactly as planned below. New `apps/builder/src/workflow/{client.ts,useWorkflows.ts,
newWorkflow.ts,WorkflowRoute.tsx}` + refactored `WorkflowEditor.tsx`; Explorer (`workspace/
{tree.ts,types.ts,ExplorerRail.tsx,ProjectWorkspace.tsx}`) surfaces workflows alongside forms
(new `"workflow"` NodeKind, `buildTree`/`dropFolderId` optional `workflows` param); route
`/projects/:projectId/workflows/:workflowId/edit` in `main.tsx`; legacy App `mode` Segmented toggle
retired. Real-form binding = a `Select` over the project's forms (dangling bound form shows
"(missing)"). Save runs `validateGraph` first (blocks on errors), dirty-tracks vs a saved-JSON
baseline, unsaved-changes guard mirrors the form `EditorRoute`. Additive, builder-only, NO contract/
`workflowVersion` change, no changeset. typecheck 15/15, new `tree`/`newWorkflow` unit tests + builder
suite green (2 known-flaky validation tests pass in isolation), biome clean. Reviewer subagent PASS
(only LOW notes, all mirrored from the forms module). Original plan below for reference.

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

## WF2 — Editor UX (make the builder usable for non-experts)  [reprioritised ahead of runtime]
Owner review found the editing experience — not persistence — is the real barrier: binding a node to
a form was disjointed (a Select over existing forms + an "Edit form" that *navigates away*; no preview,
no quick create/edit), and canvas interaction was rigid (handles fixed Left/Right so edges only flow
L→R; no visible delete affordance and no `onNodesDelete`, so deleting the start node silently stranded
`meta.start`; new states stacked in a fixed column). So **runtime moved to WF3** and WF2 is now the
editor-UX track. Builder-only, additive, NO contract change / `workflowVersion` bump / changeset.
Plan: `C:\Users\ASUS\.claude\plans\twinkly-hatching-cherny.md`.

### WF2a — Canvas interaction  ✅ DONE (branch feat/workflow-wf2-editor-ux, off main @ 95d4e03 via feat/workflow-wf0)
Safe delete + any-direction edges + faster authoring + auto-layout. Shipped:
- **Floating edges** (`workflow/floating-edge.tsx`): pure `getEdgeParams` border-intersection geometry
  (unit-tested) + a `FloatingEdge` xyflow custom edge; nodes gained 4-side connect handles +
  `connectionMode="loose"`, so transitions route to the nearest border in any direction. Contract-safe
  — edges carry editor-only `type:"floating"`/`markerEnd` via `EDGE_PRESENTATION`; `fromFlow` still
  reads only `source`/`target`.
- **Safe deletion**: `onBeforeDelete` blocks deleting the start node (while others remain) and the last
  node; `onNodesDelete`/`onEdgesDelete` clean up selection + defensively re-point `meta.start`; Delete
  buttons in the node/edge panels route through `deleteElements` so they hit the guard.
- **Faster authoring**: new state lands beside the selected node / double-click empty pane adds one at
  the pointer (`screenToFlowPosition`); double-click a node → inline-rename `<Input>` (context-fed).
- **Tidy auto-layout** (`workflow/layout.ts`): pure `tidyLayout` via `@dagrejs/dagre` (new builder dep)
  behind a "Tidy" toolbar button (unit-tested). Editor wrapped in `ReactFlowProvider`.
- Green: root typecheck 15/15, builder 272/272 (+12: floating-edge 3 + layout 3 + suite), biome clean.
  Reviewer subagent PASS (no blocking; nits: `react-flow__pane` is an internal class (commented),
  `state${n+1}` can repeat a label after deletes — cosmetic).

### WF2b — Inline form integration  ✅ DONE (commit 504c8a7, branch feat/workflow-wf2-editor-ux)
The headline win: in the node panel, render a read-only `FormRenderer` **preview** of the bound form;
a **"Tạo form mới"** button (blank → bind → open editor); and **"Sửa form"** that opens the full form
builder (`App`, already standalone) in a **Drawer** over the canvas — preview/create/edit without ever
leaving the workflow. New `workflow/useFormDefinition.ts` (getForm + migrate, cached on `qk.form(id)`);
WorkflowEditor hosts the Drawer; replaced the navigate-away `onEditForm` with it. Builder-only.

Shipped exactly as planned: `useFormDefinition.ts` (+3 tests); NodePanel→`BoundFormPreview`
(`<FormRenderer designMode readPretty/>` scroll-capped + missing/loading/error states);
"Tạo form mới" = `saveForm(newForm(title), {projectId})` → bind → `onFormsChanged` (project-tree
invalidate) → open Drawer; Drawer embeds `<App key={formId} formId projectId onSaved onDirtyChange/>`
with an unsaved-close confirm; new props `projectId`/`onFormsChanged`, dropped `onEditForm`. App's
100vh is clipped to the drawer body (`overflow:hidden`). Reviewer PASS, no required fixes
(nits: 100vh clip [accepted], getForm omits x-owner-id [pre-existing, SEED_OWNER_ID==local], static
App import could be lazy [optional]). typecheck 15/15, builder 275/275, biome clean. **Owner owes
browser smoke** of WF2b (preview shows, create+bind+Drawer, edit→save→preview refresh).

## WF3 — Runtime / instances (DEFERRED; was "WF2")  [end-to-end value]
The engine already runs; this is persistence + a thin UI.
- prisma `WorkflowInstanceRecord` (or reuse) + `WorkflowInstanceRepo`; api `createInstance` +
  `advance` endpoints inside `modules/workflows/` (engine does the logic; api loads def+instance, calls
  `advance`, persists; access via `ProjectsService.requireAccess`/`resolveRole`).
- A "Run" view: render the bound form (via `@org/form-renderer-web`) at the current state, show
  available actions, fire one, persist the advanced instance, show history.
- Its own multi-phase plan; a full draft exists from the planning pass. Revive after WF2 ships.

## WF4 — Parity polish (later)
Sharing/roles already come free via `ProjectMember` (WF0 reuses `requireAccess`). Possible later:
i18n of status/action labels (reuse the i18n pattern), workflow templates, native parity. Defer.

## Recommended slice order
**WF0 → WF1 → WF2a → WF2b → WF3**, each its own commit + reviewer + STOP. WF0/WF1 (persistence +
workspace integration) shipped; WF2 (editor UX) is the current track because the editing experience was
the user-facing blocker; runtime (WF3) is the high-value follow-up and deserves its own plan.
