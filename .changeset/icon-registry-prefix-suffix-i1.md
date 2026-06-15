---
"@org/form-schema": minor
"@org/form-renderer-web": minor
---

Add icon registry + `prefixIcon`/`suffixIcon` on the input family (Builder UX v2, I1).

`form-schema` adds optional `prefixIcon`/`suffixIcon` (string token, e.g.
`"antd:SearchOutlined"`) to the `text` field and `prefixIcon` to the `number` field.
These are additive optional props — old saved JSON keeps parsing unchanged, so
`CURRENT_FORM_VERSION` is not bumped. They sit alongside the existing text
`prefix`/`suffix` and take visual precedence when both are set. Web-only; other renderers
ignore them.

`form-renderer-web` ships a dependency-free, extensible icon **registry**
(`resolveIcon`/`registerIcon`/`registerIcons`/`registerIconNamespace`, plus an `Icon`
component and `resolveIconNode` helper). The schema stores only a string token; the
renderer resolves it to a component. A curated, form-relevant subset of
`@ant-design/icons` (about 20 glyphs, named imports) is registered as the built-in `antd:`
namespace; the rest of the icon set is never imported. `@ant-design/icons` is now a peer
dependency (it travels with antd, which the renderer already requires). New namespaces (e.g. `lucide:`) can be
registered by any consumer with no schema change. Unknown tokens resolve to `undefined`
and fall back to the text prefix/suffix — never a crash.
