---
"@org/form-schema": minor
---

i18n P2: add optional form-level `defaultLocale` and `locales` config to `formSchema`, plus
optional per-node `i18n` (locale → string) on hierarchical `treeOptionSchema` so cascader /
tree-select option labels can be translated. All additive optional props → old JSON still
parses → no `CURRENT_FORM_VERSION` bump.
