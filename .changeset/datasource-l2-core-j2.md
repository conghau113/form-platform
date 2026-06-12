---
"@org/form-core": minor
---

Data sources level 2 — form-core (Phase J2).

The dataSource helpers now resolve options against a **values record** instead of a single
parent value, so a select can depend on any number of fields:

- `buildDataSourceUrl(ds, values)` / `fetchDataSourceOptions(ds, values, fetchImpl?)` —
  apply the level-1 `dependsOn` parent (param named after the field) **and** each level-2
  `params[]` entry (`name = String(values[from])`), preserving any existing query string.
- New `dataSourceDeps(ds)` — every field name the source reads (`dependsOn` first, then
  `params[].from`, deduped) so renderers can build a stable query key and a watch set.
- New `dataSourceReady(ds, values)` — true once every dependency has a present value (not
  nullish/empty), gating the request.

**Breaking (internal):** the second argument of `buildDataSourceUrl` /
`fetchDataSourceOptions` changed from `dependsOnValue` to a `Record<string, unknown>`. The
only consumer is `@org/form-renderer-web`, updated in the same change.
