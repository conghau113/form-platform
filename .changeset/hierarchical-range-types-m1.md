---
"@org/form-schema": minor
---

Phase M field types (all additive → old JSON still parses → no `CURRENT_FORM_VERSION` bump):

- `cascader` — hierarchical single-path choice; recursive `treeOptionSchema`
  (`{label, value, children?[]}`) for static options, value = path array.
- `tree-select` — tree dropdown; scalar value, or array when `multiple`.
- `date-range` / `time-range` — `[start, end]` tuple values.
- `picker?: "date"|"week"|"month"|"quarter"|"year"` variant on `date` and `date-range`
  (`datePickerVariantSchema`).
- `selectDataSourceSchema` gains optional `childrenKey` — response rows map recursively
  into a tree of options for the hierarchical types.
