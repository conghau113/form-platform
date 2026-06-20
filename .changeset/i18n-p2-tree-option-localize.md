---
"@org/form-core": minor
---

i18n P2: `localizeForm` now recurses into hierarchical option `children`, so cascader /
tree-select nested option labels are localized from their per-node `i18n` maps (the flat
option case is unchanged). Purely declarative, no eval.
