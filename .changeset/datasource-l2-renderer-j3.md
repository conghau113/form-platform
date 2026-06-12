---
"@org/form-renderer-web": minor
---

Data sources level 2 — web renderer (Phase J3).

A select's remote `dataSource` is now genuinely multi-dependency and cached:

- **Multiple parents** — `SelectControl` reads every dependency field (the `dependsOn`
  parent plus each `params[].from`) via `dataSourceDeps`, builds the request through
  form-core's values-record API, and the react-query key includes every dep value so
  changing any parent refetches.
- **Gating** — the fetch waits until **all** dependencies have a value
  (`dataSourceReady`); the empty-state message lists each still-missing field
  ("Select country, city first").
- **Caching** — `dataSource.ttlMs` maps to react-query `staleTime`, so a repeated param
  combination is served from cache instead of refetching.

A reaction `options` effect still overrides remote/static options. Runtime DOM is
unchanged for forms without a dataSource.
