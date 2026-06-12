---
"@org/form-renderer-web": minor
---

Apply reaction (linkage) effects in the web renderer (Phase G3).

`FormRenderer` now computes the top-level `EffectMap` via `computeReactions(form, watch())`
each render and applies it:

- **visible** — `renderNode` resolves visibility through `effectiveVisible`, so a reaction
  can reveal a `visibleWhen:false` field or hide one; reaction-hidden fields drop out of
  validation/submit exactly like `visibleWhen` (the resolver was already reaction-aware
  from G2).
- **disabled** — a leaf's editability honors `eff.disabled`, including re-enabling a
  statically `disabled` field via a `disabled:false` reaction.
- **options** — select/radio accept an `optionsOverride` injected by an `options` effect,
  overriding static or remote `dataSource` options.
- **value** — a single `useEffect`, keyed on the serialized assignments from
  `collectValueEffects`, pushes each value via `setValue` only when it actually differs
  (loop-safe with the engine's value-cycle guard).

Effects apply only at the top-level scope (`namePrefix === ""`); per-row array linkage
lands in G4. New `FormRenderer.reactions.test.tsx` covers show/hide, the reaction-hidden
required field, disable + re-enable, value-set without looping, and options swap.
