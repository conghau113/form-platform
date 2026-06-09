# EXECUTION — runbook to the final product

Execute top to bottom, ONE phase at a time. After each phase, run the Closing Loop.
`/clear` between phases. Conventions live in AGENTS.md — never restate them in a prompt.

## North star (what "done" means)
A schema-driven platform where you visually build a form (drag-drop + property panel),
theme it live, export versioned JSON that the backend stores and the frontend reloads to
render — on responsive web AND React Native — with conditional logic, field-level RBAC,
validation and dynamic data sources; later extended into a drag-drop workflow builder
(React Flow) where each node binds a form. Built as a maintainable pnpm monorepo and
driven autonomously by Claude Code.

## The Closing Loop (run after EVERY phase)
1. The agent self-verifies: `pnpm typecheck` + `pnpm test` until green.
2. You: "use the reviewer subagent to review the diff against the golden rules", then fix.
3. `pnpm changeset` (record the bump). 
4. `git commit` — one logical change.
5. `/clear` before the next phase.

> Always enter plan mode (shift+tab) first; review the plan before any code is written.

---

## Phase 0 — Assemble + verify foundation
Run in terminal first:
```
unzip form-platform-starter.zip && cd form-platform
unzip ../agent-config.zip -d /tmp/ac && cp -R /tmp/ac/agent-config/. .
cp ../PLAYBOOK.md . ; cp ../EXECUTION.md .
corepack enable && corepack prepare pnpm@latest --activate
pnpm install && git init && git add -A && git commit -m "chore: scaffold + agent config"
```
Then open Claude Code in `form-platform/` and run:
```
Read AGENTS.md, PLAYBOOK.md and EXECUTION.md. Enter plan mode first.
Verify the monorepo: pnpm install, pnpm typecheck, pnpm test. Fix until all green.
Report the state of every package. Scope: packages only; do not touch apps/.
```
GATE: build + all tests green.

## Phase 1 — form-schema (contract is solid)
```
Plan first. In packages/form-schema only: ensure there is a test that loads
examples/form.v1.json and asserts migrate() brings it to CURRENT_FORM_VERSION. Add a
second field type to the schema (e.g. "textarea") with its migration unaffected, plus a test.
```
GATE: `pnpm --filter @org/form-schema test` green; old JSON still migrates.

## Phase 2 — form-core (shared runtime)
```
Plan first. In packages/form-core only: add unit tests for isVisible (JSONLogic) and
canView/canEdit (RBAC) covering true/false branches. Keep it dependency-light.
```
GATE: core tests green; no React/antd imported here.

## Phase 3 — form-renderer-web (vertical slice)
```
Plan first. In packages/form-renderer-web ONLY:
Make FormRenderer fully render examples/form.v1.json: text, select with static options,
the visibleWhen conditional on "country", and the admin-only field via RBAC. Add a
Vitest + @testing-library/react test: the conditional field shows only when country ===
"OTHER"; the admin-only field is hidden when access.roles is []. Don't touch other packages.
```
GATE: example renders; conditional + RBAC + responsive cols proven by tests.

## Phase 4 — builder skeleton (live preview)
```
Plan first. Scaffold apps/builder as Vite + React + TS + antd:
Two panes — left JSON editor (textarea ok for now), right live preview via
@org/form-renderer-web, seeded with examples/form.v1.json. A viewport toggle
(desktop/tablet/mobile width) around the preview. `pnpm --filter @app/builder dev` boots
and the preview updates live as JSON changes. Only touch apps/builder + its package.json.
```
GATE: dev server boots; editing JSON updates the rendered form live.

## Phase 5 — persistence (close the JSON round-trip)
```
Plan first. Scope: new apps/api (NestJS) + apps/builder. Do not touch packages/.
apps/api: POST /forms (save) + GET /forms/:id (load) storing the form JSON; validate the
body on the server with @org/form-schema (migrate + formSchema.parse) — server is source of
truth. apps/builder: Save and Load buttons wired to those endpoints.
Acceptance: save the edited schema, reload the page, Load brings it back and it renders.
```
GATE: full round-trip JSON -> BE -> reload -> render works.

## Phase 6 — form state + real validation
```
Plan first. Scope: packages/form-core + packages/form-renderer-web.
form-core: a helper that builds a Zod schema from a FormSchema (required, min/max, maxLength),
reusable cross-platform. form-renderer-web: replace manual useState with react-hook-form +
@hookform/resolvers/zod using it; onSubmit emits a clean typed values object; hidden
(visibleWhen=false) fields are excluded from validation. Tests: a required field blocks
submit; a hidden field is not validated.
```
GATE: form validates on submit and returns a typed payload.

## Phase 7 — dynamic data sources
```
Plan first. Scope: packages/form-renderer-web (+ @tanstack/react-query peer dep).
Implement select.dataSource: fetch options from dataSource.url via react-query, map
labelKey/valueKey; support dependsOn (refetch when the parent field changes); loading +
error states. Test with a mocked fetch.
```
GATE: remote + dependent selects work.

## Phase 8 — drag-and-drop authoring
```
Plan first. Scope: apps/builder only.
Left: component palette (field types). Middle: @dnd-kit canvas — drop, reorder, select
fields. Right: property panel editing the selected field (label, required, layout.colSpan,
visibleWhen, permissions). Canvas state maps to/from a FormSchema; keep dnd-kit internals
OUT of the schema (convert only at the boundary). Replace the textarea with visual editing +
a read-only synced JSON view. Add undo/redo.
Acceptance: build the example form entirely by dragging + configuring (no hand-edited JSON);
the produced JSON validates and renders identically in the preview.
```
GATE: a form can be authored visually end-to-end.

## Phase 9 — theme editor
```
Plan first. Scope: new packages/form-theme + apps/builder.
form-theme: a platform-neutral design-token type (colors, spacing, radius, typography) +
a mapper to an antd ThemeConfig. apps/builder: a Theme Editor screen editing the main tokens
(colorPrimary, borderRadius, fontSize...), wrapping the live preview in <ConfigProvider theme>,
supporting default + dark algorithm, exporting theme JSON. Persist the theme alongside the
form via the Phase 5 API.
Acceptance: change a token -> preview updates live; export theme JSON; reload applies it.
```
GATE: theme is editable, previewed live, exported, persisted, reapplied.

## Phase 10 — React Native renderer
```
Plan first. Scope: packages/form-renderer-native only.
Implement leaf components (text/number/select/date/checkbox) with react-native-paper (or
@ant-design/react-native). Single column; honor only hideOnMobile/mobileOrder. Reuse
migrate / isVisible / RBAC / the Zod validation helper from form-core — do not reimplement.
Tests with @testing-library/react-native.
Acceptance: the example renders on native with the same conditional + RBAC behavior as web.
```
GATE: same schema renders correctly on native.

## Phase 11 — workflow builder (expansion)
```
Plan first. Scope: new packages/workflow-schema, packages/workflow-core, apps/builder.
workflow-schema: versioned contract (workflowVersion + migrations). Nodes carry id, status,
formId (reference to a form), and transitions (edges) with guard (JSONLogic), role, action.
workflow-core: a pure-TS engine (current state + event + data -> evaluate guard, check role,
return next state) that runs on BOTH FE and a NestJS backend; no React. apps/builder: a
workflow editor with @xyflow/react; custom node types; each node opens the existing form
builder to bind its form; adapt xyflow nodes/edges to/from workflow-schema ONLY at the
boundary; validate the graph (one start, all nodes reachable). Separate definition (versioned
template) from instance (running case + current state + history; instance pins its
definitionVersion).
Acceptance: build created->inprogress->done with a form per node; workflow-core advances an
instance honoring guards + roles; definition exports as JSON.
```
GATE: a dynamic workflow runs end-to-end on top of forms.

## Phase 12 — CI + release
```
Plan first. Scope: .github/workflows + root config only.
PR workflow: pnpm install, turbo typecheck, turbo test, biome check, changeset status check.
Release workflow on main: changesets version + publish to the private registry.
Acceptance: PRs run all checks; merged PRs with changesets publish bumped packages.
```
GATE: every agent PR is gated automatically; releases are one-click.

---

## Final acceptance — maps to the original requirements
- [ ] Versioned schema + migration; old JSON always renders (P1)
- [ ] Conditional logic, field-level RBAC, validation, data sources (P3, P6, P7)
- [ ] Drag-drop form builder with layout + per-field config, antd-based (P8)
- [ ] Theme editor like antd: live preview, apply, export JSON (P9)
- [ ] Export JSON -> BE stores -> FE reloads -> renders (P5)
- [ ] Same schema renders on responsive web AND React Native (P3, P10)
- [ ] Workflow builder on top, nodes bind forms, runs dynamically (P11)
- [ ] Maintainable/reusable monorepo, latest tooling, CI-gated (whole repo, P12)

## Context discipline (keep token cost down)
Plan before multi-file work · delegate discovery to the explorer subagent · @-mention files,
don't paste · let tests be the feedback loop · /clear between phases · /compact + focus note
when context fills · keep CLAUDE.md tiny (it imports AGENTS.md).
