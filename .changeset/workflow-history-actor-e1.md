---
"@org/workflow-schema": patch
---

Record WHO fired an action: `historyEntry.actor` (optional user id) — the "ai đã
làm" half of work-order tracking (product roadmap Phase E).

Additive and optional, so history written before this key keeps parsing and
**no `CURRENT_WORKFLOW_VERSION` bump is needed** (same character as `i18n` /
`statusCode` / `kind`). Instances are never migrated — `migrate.ts` covers
definitions only — so old stored cases are unaffected.

Deliberately a user id, never a display name: names are resolved at read time so
a renamed or removed user is not frozen into a case's history.
