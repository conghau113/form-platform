---
"@org/workflow-core": patch
---

Fix `createInstance` handing two cases the same id. A generated id was
`<definition>-<millis>`, so two cases started on the same workflow within the same
millisecond were born identical — and a store that writes by id (the API upserts) then
REPLACED the first case with the second, silently losing it. Generated ids now carry a
random suffix as well: `<definition>-<millis>-<random>`.

Caller-supplied ids are untouched, and nothing parses the generated shape (ids are opaque
everywhere in the repo), so this is safe for existing data.
