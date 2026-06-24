---
"@org/workflow-ai": patch
---

Make the workflow golden-set eval robust to legitimate language variation and
tighten the generation prompt's language directive:

- `scoreWorkflowCase` now matches `expectStates`/`expectActions`
  diacritic-/case-/separator-insensitively (via `@org/ai-core` `foldedIncludes`),
  so an ascii needle like `"tu_choi"` matches a model emitting `"Từ chối"`. This
  fixes the brittle ascii assertions that depressed the live pass-rate even when
  the graph-valid-rate was 100%.
- The generation prompt now states explicitly that every human-readable string
  (title, node status, transition action) must be in the request's language and
  must not default to English.
