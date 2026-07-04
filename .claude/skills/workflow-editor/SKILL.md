---
name: workflow-editor
description: Conventions and file-map for the Workflow Editor v2 track (xyflow-based workflow builder in apps/builder). Read this WHENEVER touching workflow nodes/edges/layout/contract, the workflow editor UX, status catalog, or resuming the workflow-editor-v2 plan. Keeps cold sessions consistent across the /clear-between-phases workflow.
---

# Workflow Editor — house rules

> **Layer:** L3 — Execution Adapter (skill binding). Originates no rule (constitution §2); it renders the
> workflow-editor track's conventions, which live in the source.
> **Source:** `docs/expansion/workflow-editor-v2.md` (the track plan / source-of-truth, cited below) +
> the `@org/workflow-schema` / `@org/workflow-core` contract. The validateGraph-hard vs lintGraph-advisory
> split is [ADR-0017](../../../decision-records/ADR-0017-validategraph-hard-vs-lintgraph-advisory.md); additive
> `workflowVersion` mirrors ADR-0014.
> **Regenerated:** E5 T5.1.1 · 2026-07-05 — verified against source, no drift.

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
- Layout: `@dagrejs/dagre` LR in `layout.ts` (pure). Edges: prefer `getSmoothStepPath` over bezier
  for readability with auto-layout.
- Status catalog (WE4): follow the preset library pattern (project-scoped master data OUTSIDE the
  contract) + linked-field denorm (node keeps snapshot + references `statusCode`); derive color from
  node_type/catalog, don't store raw color in the contract.

## Definition of done (every phase)
`pnpm typecheck` + tests green + `pnpm biome check` clean + changeset (if a package changed) +
reviewer subagent PASS + live smoke via MCP browser (before/after). Self-verify before reporting done.
Then: tick the plan doc, update memory, commit (owner gates push/merge), tell owner to /clear.
