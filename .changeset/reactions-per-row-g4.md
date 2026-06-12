---
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Per-row visibleWhen + reactions inside arrays (Phase G4).

Array rows are now reactive. `buildZodSchema`'s `arrayZod` validates each row against its
OWN shape, computed against a MERGED scope (`{ ...outerValues, ...row }`, row keys win):
length bounds (`required`/min/max) are asserted on the raw array first, then a
`superRefine` validates each row (emitting issues at `[i, ...path]`) and a `transform`
re-parses each row to strip its hidden/non-viewable keys. This lifts the Phase C
limitation where an array's item schema was built against empty values (always-visible,
always-validated). `computeNodeReactions` is run per row, so per-row reactions apply too.
`collectValueEffects` now recurses into visible arrays, emitting dotted RHF paths
(`array.{i}.{field}`) evaluated against each row's merged scope.

In the web renderer, `renderNode` carries an optional row `scope` (merged values + per-row
`EffectMap`); `ArrayFieldSection` builds a `getRowScope(i)` and threads it into both the
card and table variants, so per-row visibility/disabled/options and value effects resolve
against the row. Nested arrays compose (inner row scope merges over the outer). The builder
PropertyPanel now offers the Visibility section for array item fields (previously gated
off). The value-effect `useEffect` pushes dotted per-row paths via `setValue`.

BEHAVIOR CHANGE: a pre-existing `visibleWhen` on an array item field previously evaluated
against the WHOLE form's values and the field was always validated. It now evaluates
against the row's merged scope and a hidden row field is excluded from validation and
stripped from output — consistent with top-level fields. The merge keeps top-level
references working (outer values are visible in the row scope). A select's
`dataSource.dependsOn` inside a row resolves against the merged row scope (a top-level
dependsOn still reads its value through the merge; finer per-row dependsOn is out of scope).
