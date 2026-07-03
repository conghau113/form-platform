# ADR-0017: validateGraph hard-gate vs lintGraph advisory split

- **Status:** Accepted (retroactive)
- **Date:** Backfilled 2026-07-04. `validateGraph` in force from `a057961`; the deliberate
  hard/advisory split established when `lintGraph` was added (`e6e7c6f`, WE5a, 2026-06-28).
- **Deciders:** Owner
- **Source:** `packages/workflow-core/src/graph.ts`; workflow-editor track (memory
  `session-resume-workflow-editor-v2`, "BÀI HỌC WE5a").

> *Rationale reconstructed from repository evidence; ratified by owner.*

## Context

`workflow-core` exposes two structural checks over a `WorkflowDefinition`.
`validateGraph` returns hard errors (duplicate node ids, missing/absent start, dangling
transitions, unreachable nodes). `lintGraph` returns advisory warnings (`dead-end`,
`end-has-outgoing`) for graphs that parse and run but are probably a mistake. Both feed
the editor and, critically, the AI generation moat.

## Decision

The two checks are kept **separate on purpose and never merged**:

- **`validateGraph` is a hard gate.** It blocks editor save and is the fatal check in the
  AI generation moat (`normalizeWorkflowDraft` → bounded repair loop): every error is
  treated as fatal, and it also feeds the eval parse-rate metric.
- **`lintGraph` is advisory only.** Its warnings surface in the editor (amber ring +
  panel) but **never gate save and never enter the AI repair loop.**
- New "suspicious but runnable" findings go into `lintGraph`, **never** into
  `validateGraph`. `validateGraph` is not extended with soft checks.

## Rationale

`validateGraph` is load-bearing in two systems at once: it is the editor's save gate *and*
the AI moat's definition of "valid enough to accept." The AI repair loop treats every
`validateGraph` error as fatal and retries generation until they are gone. If a merely
*advisory* concern ("this node is a dead end") were added to `validateGraph`, it would
become a fatal condition the model must repair — turning a stylistic nag into something
that can make generation fail or loop, and inflating the false-negative rate of the parse
metric. Keeping the advisory checks in a separate function preserves a sharp, stable
definition of structural validity for the gate while still letting the editor warn humans.
The workflow-editor session record notes this was a near-miss: extending `validateGraph`
was considered and rejected precisely because it would weaken the AI-repair-loop gate —
which is the exact rationale a future session lacking this record could re-make and
regress.

## Evidence

- `packages/workflow-core/src/graph.ts:16-88` — `validateGraph` (hard errors); `:90-144`
  — `lintGraph` with the doc: "Advisory structural checks, kept SEPARATE from validateGraph
  on purpose: the editor's save gate and the AI moat … treat every validateGraph error as
  fatal, so these 'suspicious but runnable' findings must NOT live there."
- `apps/builder/src/workflow/WorkflowEditor.tsx:318-320` — `validateGraph` blocks `save()`;
  `:651-654` — `lintGraph` warnings "get an amber ring and a panel section but NEVER gate save."
- `packages/workflow-ai/src/pipeline.ts:15-20` — the moat re-validates model output for
  "BOTH contract shape and graph well-formedness" via `normalizeWorkflowDraft` (= migrate +
  Zod + `validateGraph`) each repair round.
- Origin: `a057961` *feat(workflow): versioned workflow contract, pure engine, xyflow editor*
  (validateGraph); `e6e7c6f` *feat(workflow-editor): WE5a — advisory graph lint* (the split).
- Changeset `.changeset/workflow-lint-graph-we5a.md`.
