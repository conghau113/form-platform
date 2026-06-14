# form-renderer-web — architecture

antd renderer that CONSUMES the `@org/form-schema` contract and `@org/form-core`
runtime. It never re-implements validation, conditions, or RBAC — only maps schema
nodes to antd controls + layout. `react`/`react-dom`/`antd` are peerDependencies.

## Where things live (`src/`)
| Concern | File | Read it when… |
|---|---|---|
| Public component, `renderNode` tree walk, RHF wiring, async resolver | `FormRenderer.tsx` | changing how a node type lays out, submit/validation flow, designer `nodeWrapper` |
| Imperative dialog/drawer popups | `imperative.tsx` | changing `openFormDialog`/`openFormDrawer` |
| Barrel (public API) | `index.ts` | adding/removing an export |
| Shared control types + guards (`Scope`, `RenderNodeOpts`, `OptionSourced`, `READONLY_INPUT_TYPES`, `Values`) | `internal/control-types.ts` | a type is shared between controls and the renderer |
| `schemaDefaults`, `containsType`, `collectStepNames` | `internal/defaults.ts` | default-value seeding or step-name collection |
| `getAtPath`/`setErrorAtPath`/`runAsyncCheck` + async cache types | `internal/resolver.ts` | async-validator debounce/cache or dotted-path error placement |
| Leaf control dispatch (the big `switch`) | `controls/FieldControl.tsx` | adding/altering an antd control for a leaf type |
| Option-sourced controls | `controls/{Select,CheckboxGroup,Cascader,TreeSelect}Control.tsx` | a select-like control's UI/loading/error state |
| Remote dataSource fetch hook | `controls/useRemoteOptions.ts` | react-query wiring / dependency gating for options |
| Read view (PreviewText) | `preview/previewText.ts` + `preview/FieldPreview.tsx` | how a value renders in readPretty/readOnly |
| Repeatable list (Form List) | `containers/ArrayFieldSection.tsx` | array card/table layout, per-row controls, editInDialog |
| Wizard | `containers/StepsSection.tsx` | step navigation / per-step validation / submit-fail jump |

## Coupling notes (why the split stops where it does)
- `renderNode` is a **closure inside `FormRenderer`** — it captures `effects`,
  `warnings`, `access`, `control`, `designMode`, etc. It is intentionally NOT
  extracted; the leaf/container pieces it delegates to ARE.
- The container `<Col>` wrappers, span math, and `nodeWrapper` designer shell stay in
  `FormRenderer.tsx` because they depend on that closure's scope.
- Imports inside this package use explicit `.js` extensions (ESM, `moduleResolution:
  bundler`). Match that when adding files here.

## Invariant
Renderer changes must be ADDITIVE — older schema versions keep rendering. Tests
(`src/FormRenderer.*.test.tsx`) assert runtime DOM/behavior; keep them green.
