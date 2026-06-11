---
"@org/form-schema": minor
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Layout containers + form/field layout props (Designer engine, Phase D).

`form-schema` adds seven optional, value-transparent container node types — `tabs`,
`tab-pane`, `collapse`, `collapse-panel`, `card`, `grid` (1–24 cols, default 2) and
`space` — alongside the existing `group`. `tab-pane`/`collapse-panel` are their own union
members so a designer can treat every node uniformly, while `tabs.children`/
`collapse.children` are structurally restricted to panes/panels. It also adds an optional
`layoutProps` on the form root (antd `layout`/`labelCol`/`wrapperCol`/`size`/`colon`/
`labelAlign`/`labelWrap`) and an optional per-field `decoratorProps` override. New shared
helpers `isLayoutContainer` / `childrenOf` / `childrenKeyOf` are the single source for tree
walks. All additive — old JSON still parses and `migrate` recurses the new children — so
`CURRENT_FORM_VERSION` is unchanged.

`form-core` hoists container children when building the Zod shape via `isLayoutContainer`,
so a hidden container (visibleWhen/permissions) drops its whole subtree from validation;
values stay flat (only `array` nests).

`form-renderer-web` renders real antd `Tabs`/`Collapse` (with `forceRender` so React Hook
Form controllers in unvisited panes still register), `Card`, `Grid` (Row/Col) and `Space`;
applies `layoutProps` to the antd `Form` and spreads `decoratorProps` onto each
`Form.Item`. `renderNode` gained `hideLabel`/`bare`/`span` options.
