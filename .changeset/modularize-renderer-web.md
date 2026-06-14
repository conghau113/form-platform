---
"@org/form-renderer-web": patch
---

Internal refactor: split the monolithic `FormRenderer.tsx` into focused modules
(`controls/`, `preview/`, `containers/`, `internal/`) with `FormRenderer.tsx` keeping
only the component, `renderNode` tree walk, and async resolver. Public API and runtime
behavior are unchanged.
