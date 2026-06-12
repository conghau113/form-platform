---
"@org/form-schema": minor
---

Data sources level 2 — schema (Phase J1).

A select's `dataSource` gained two optional, additive fields (extracted to a reusable
`selectDataSourceSchema`):

- **`params: { name, from }[]`** — map any number of query params to other fields' current
  values. `name` is the query-param name, `from` is the source field. Generalizes the
  single `dependsOn` parent (which stays as a back-compat shorthand) to multi-field
  dependent selects.
- **`ttlMs`** — cache fetched options for this many ms (the web renderer maps it to
  react-query `staleTime`).

Additive only — old saved JSON still parses, so `CURRENT_FORM_VERSION` is unchanged.
