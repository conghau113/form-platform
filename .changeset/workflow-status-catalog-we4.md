---
"@org/workflow-schema": minor
---

Status catalog — schema (WE4).

A reusable, project-scoped **status catalog** for workflows (master data, mirroring form-schema's
preset W3 + linked-field W4 patterns):

- New `statusCatalogEntrySchema` / `StatusCatalogEntry` (`code`, `label`, `kind`, optional
  `color`, plus `scope` global/project like presets). It lives OUTSIDE the workflow contract and
  is decoupled from `CURRENT_WORKFLOW_VERSION`.
- `StatusKind` is the closed, engine-meaningful set `start | normal | end` (the two-tier model:
  fixed kinds + unlimited custom catalog statuses mapped onto them).
- `workflowNodeSchema` gained two optional, additive fields: `statusCode` (references a catalog
  entry) and `kind` (a frozen category snapshot so colour survives a deleted catalog entry).

Additive only — old saved definitions without these keys still parse, so
`CURRENT_WORKFLOW_VERSION` is unchanged (parse-compat test instead of a migration).
