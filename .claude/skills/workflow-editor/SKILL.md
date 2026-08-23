---
name: workflow-editor
description: Conventions and file-map for the Workflow Editor v2 track (xyflow-based workflow builder in apps/builder). Read this WHENEVER touching workflow nodes/edges/layout/contract, the workflow editor UX, status catalog, or resuming the workflow-editor-v2 plan. Keeps cold sessions consistent across the /clear-between-phases workflow.
---

# Workflow Editor — house rules

Plan + progress: `docs/expansion/workflow-editor-v2.md` (SOURCE OF TRUTH — tick + update after every phase).
Resume memory: `session-resume-workflow-editor-v2` + the older `session-resume-workflow`.

## Layering (never violate)
- `@org/workflow-schema` = versioned JSON contract (Zod). `@org/workflow-core` = pure engine
  (validateGraph, advance). Editor = xyflow in `apps/builder/src/workflow/`. Renderers/editor
  CONSUME the contract; never duplicate validation.
- `position` is the ONLY presentation data allowed in the contract. All other xyflow runtime
  fields (selected, dragging, measured, label, edge `type`) stay at the boundary in
  `workflow-model.ts` (`toFlow`/`fromFlow`) — `fromFlow` reads back only id/position/data.

## Additive rule (workflowVersion)
- New field = OPTIONAL ⇒ do NOT bump `CURRENT_WORKFLOW_VERSION`; add a parse-compat test that an
  old definition still parses (precedent: form-schema i18n + linked fields). Only bump + add a
  migration in `migrate.ts` when an existing shape changes or is removed. NEVER break saved JSON.
- Changeset required for any changed published package (workflow-schema/core/ai). `apps/*` are
  private → no changeset.

## Reuse, don't rebuild
- Undo/redo: reuse `apps/builder/src/engine/history.ts` (`History<T>` is value-generic) — snapshot
  `{meta,nodes,edges}` so positions are included. Mirror `editor/useFormEditor.ts`,
  `editor/useEditorShortcuts.ts`, `workbench/HistoryPanel.tsx`.
- Path highlight: react-flow utils `getIncomers`/`getOutgoers`/`getConnectedEdges` (recurse from
  `start`). Keep the trace a PURE function (test without DOM), like `floating-edge.ts` getEdgeParams.
- Layout: `@dagrejs/dagre` in `layout.ts` (pure), `LR` **or** `TB` — direction is editor state, never
  contract. `align: "UL"` keeps the spine straight; do not drop it. `sideLaneSinks()` pulls collection
  points (no outgoing edge + >=3 distinct sources that EXIST) out of dagre entirely and
  `placeSideLane()` parks them beside the spine. Edges: prefer `getSmoothStepPath` over bezier.
- Edge geometry lives in `floating-edge.tsx` as PURE functions, layered:
  `axisEdgeParams` (pick anchors by axis; `null` when the boxes overlap on both axes → falls back to
  `getEdgeParams`) → `edgeLane` (split overlapping edges between the same pair) → `offsetAlongNormal`
  → `getSmoothStepPath`. `edgeGeometry(lane, sourceBox, targetBox)` composes all of it — measure the
  COMPOSITION, not the steps, or the joins go untested.
- Status catalog (WE4): follow the preset library pattern (project-scoped master data OUTSIDE the
  contract) + linked-field denorm (node keeps snapshot + references `statusCode`); derive color from
  node_type/catalog, don't store raw color in the contract.

## Canvas layering (WE7 — three halves, break one and the bug returns silently)
Transitions must paint ABOVE the state cards, or an edge crossing a card just disappears. xyflow
paints `.react-flow__edges` before `.react-flow__nodes` and gives both z-index 0, so this takes THREE
coordinated pieces — and there is no runtime test that can see them (no test renders `WorkflowEditor`,
and jsdom cannot build an xyflow edge at all):
1. `EDGE_PRESENTATION.zIndex = 1` in `workflow-model.ts` (the edge PATH),
2. `.workflow-canvas .react-flow__edgelabel-renderer { z-index: 1 }` (the LABEL, a separate layer),
3. `.workflow-canvas .react-flow__node:hover { z-index: 2 !important }` — raising the edge raises its
   invisible 20px `react-flow__edge-interaction` hit band too, which otherwise steals clicks AND
   connect handles from any card an edge crosses. Measured: 2 of 4 handles on one card became
   unusable. Do NOT "fix" that by narrowing the hit band — a width tuned to one graph fails the next.

All three are pinned by SOURCE-TEXT assertions in `workflow-model.test.ts` (`readFileSync` + regex),
plus `className="workflow-canvas"` on `<ReactFlow>`. Keep them in sync when touching any of it.

## Definition of done (every phase)
`pnpm typecheck` + tests green + `pnpm biome check` clean (scope to changed files — repo baseline is
not clean) + changeset (if a package changed) + **`reviewer` subagent TWO rounds** + live smoke.
Self-verify before reporting done. Then: tick the plan doc, update memory, commit (owner gates
push/merge), tell owner to /clear.

⚠️ **Live-smoke limits via the MCP browser** (measured WE7, will waste an hour if rediscovered):
the driven tab is permanently `document.visibilityState === "hidden"`, so `requestAnimationFrame`
never fires and a freshly opened tab never runs ResizeObserver (0 nodes measured). Anything behind a
rAF — including xyflow's `fitView` — CANNOT be judged there; a "it never fires" reading is an
artifact, not a finding. Workarounds: take a `screenshot` to force a render before measuring, and
read geometry from the xyflow store via the React fiber rather than from pixels. `:hover` needs a
real cursor and cannot be triggered with `dispatchEvent`. The `zoom` action permanently corrupts the
window size (device-metrics override that `resize_window` will not clear) — open a new tab instead.
