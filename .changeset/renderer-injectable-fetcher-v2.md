---
"@org/form-renderer-web": minor
---

Add an injectable `FormRenderer.fetcher?: typeof fetch` (Track V — V2). The renderer's two
remote calls — dataSource option lists and `asyncValidator` value checks — now route through
this fetch when provided, so an authenticated host can add `Authorization` headers or point at
a proxy base, e.g. `fetcher={(u, o) => fetch(u, { ...o, headers: { Authorization } })}`.

Purely additive: the prop flows to option controls through a small `FetcherContext` (no
prop-drilling) and is threaded straight into the async resolver. Absent ⇒ both sinks fall back
to the global `fetch` (the form-core `fetchDataSourceOptions`/`checkAsyncValidator` already
accept an injectable `fetchImpl`), so runtime is byte-for-byte unchanged when the prop is
omitted. The imperative `openFormDialog`/`openFormDrawer` wrappers forward `fetcher` too.
`form-core` is unchanged (it already supported the seam).
