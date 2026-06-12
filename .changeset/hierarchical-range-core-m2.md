---
"@org/form-core": minor
---

Phase M runtime support:

- `leafZod` cases for the new types — `cascader` validates as a path array
  (required ⇒ non-empty), `tree-select` mirrors select (scalar, or array+min1 when
  `multiple`), `date-range`/`time-range` assert a full `[start, end]` tuple when
  required (shape stays renderer-owned, like date/time).
- `fetchDataSourceOptions` maps rows RECURSIVELY when the dataSource declares a
  `childrenKey`, producing a tree; `DataSourceOption` gains optional `children`.
  Flat sources are byte-identical to before.
