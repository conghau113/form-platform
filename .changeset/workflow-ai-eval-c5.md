---
"@org/workflow-ai": minor
---

Add the workflow golden-set eval harness (P3 / Track C, phase C5). Mirrors the
`@org/form-ai` eval: a `src/eval/` module that runs the real `generateWorkflow`
pipeline over a set of golden cases with ANY `AiProvider` (deterministic fixture
in CI, or a BYOK live model) and scores the output — never special-casing the
pipeline, so the metrics reflect production.

- `scoreWorkflowCase` / `summarizeWorkflowEval` — pure, deterministic scoring:
  state + action coverage, min state/transition counts, and the headline
  `parseRate` which (because a result is only `ok` after Zod **and**
  `validateGraph`) IS the graph-valid-rate. Target ≥ 0.95.
- `GOLDEN_WORKFLOWS` — 9 EN+VI cases (incl. the 3-level leave-approval moat
  acceptance); every `referenceDraft` is contract- AND graph-valid (self-tested).
- `runWorkflowEval` + `fixtureProvider` (zero-token CI) + `providerFromEnv`
  (`WORKFLOW_AI_EVAL_*`, opt-in live, env-gated `describe.skipIf`) +
  `formatWorkflowEvalReport`. Transient provider *throws* are retried so one
  proxy blip can't abort the run; an exhausted throw is scored, not thrown.
