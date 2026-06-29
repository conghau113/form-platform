---
"@org/workflow-core": minor
---

Add `deriveCaseLabel(data)` — a pure heuristic that picks a human-readable label
(e.g. an employee's name) from a workflow case's form data. Shared by the api
(denormalized onto the instance summary) and the Run view, so a case list shows
the subject instead of an opaque machine id (#1).
