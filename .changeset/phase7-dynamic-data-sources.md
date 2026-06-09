---
"@org/form-renderer-web": minor
"@org/form-core": minor
---

Dynamic data sources for `select` fields.

`form-core` gains platform-agnostic helpers `buildDataSourceUrl` and
`fetchDataSourceOptions` (with `DataSourceOption`/`SelectDataSource` types): they build
the request URL and map remote rows via `labelKey`/`valueKey`, so every renderer reuses
the same fetch + mapping logic. When a select declares `dataSource.dependsOn`, the parent
field's current value is sent as a query param **named after `dependsOn`**
(e.g. `dependsOn: "country"` → `?country=VN`); existing query strings are preserved.

`form-renderer-web` now resolves `select.dataSource` at render time via
`@tanstack/react-query` (added as a peerDependency): a self-contained `QueryClient`
(retries off) fetches options, refetches when the `dependsOn` parent changes, gates the
request until the parent has a value, and surfaces loading + error states on the antd
`Select`. Static `options` selects are unchanged. Tests cover remote options, dependsOn
gating + refetch, and the error state.
