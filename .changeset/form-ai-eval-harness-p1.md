---
"@org/form-ai": minor
---

Add the golden-set eval harness (AI-agent-native P1, slice 3) — measures the
parse-rate of `generateForm` so the P1 acceptance bar (≥95%) is verifiable.

- `eval/golden.ts` — a labeled golden set (English + Vietnamese prompts) pairing
  each input with a machine-checkable `expect` (min field count, required field
  types, expected fields) and a `referenceDraft` example answer.
- `eval/score.ts` — pure scoring: `scoreCase` (parsed? type/field coverage? count?)
  and `summarizeEval` (parse-rate, pass-rate, averages). No model needed.
- `eval/run.ts` — `runFormEval(provider)` drives the real pipeline over the set;
  `fixtureProvider` replays reference answers for a zero-token CI run; `providerFromEnv`
  builds a BYOK live provider; `formatEvalReport` renders a CLI summary.
- Deterministic tests prove the machinery and that every golden expectation is
  achievable (fixture parse-rate = 100%). An opt-in `describe.skipIf` live test
  certifies the ≥95% bar against a real model when `FORM_AI_EVAL_*` env is set.
