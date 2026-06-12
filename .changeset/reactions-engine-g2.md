---
"@org/form-core": minor
---

Add the reactions (linkage) engine + reaction-aware validation precedence (Phase G2).

New `reactions.ts` exposes a pure engine that turns a form's `reactions[]` into an
`EffectMap` (`Record<targetName, { visible?, disabled?, value?: { set }, options? }>`):

- `computeReactions(form, values)` / `computeNodeReactions(nodes, values)` — walk the tree
  (through value-transparent containers, **not** into `array.itemFields`, which stay
  row-scoped for G4), evaluate each reaction's `when` in a single pass against the input
  values, and collapse matches. `effect: "visible"` defaults its payload to `true`;
  `value` is wrapped as `{ set }` so "clear to undefined" differs from "no effect"; last
  matching reaction wins per (target, effect).
- Guards: self-target reactions are skipped, and a static cycle guard over **value**
  effects (`extractVars` → target→deps graph) drops the reaction that would close a cycle
  (earlier-declared wins). Reactions whose source field is itself hidden still fire — a
  deliberate single-pass tradeoff, pinned by a test.
- `effectiveVisible(node, values, effects?)` centralizes precedence
  `reactions > visibleWhen > static`, and `collectValueEffects(form, values)` lists the
  top-level value assignments for the renderer to push.

`conditions.ts` factors the JSONLogic evaluation into a shared `evalRule(rule, values)`
(the single SAFE choke point; `isVisible` delegates). `buildZodSchema` now computes the
top-level `EffectMap` internally (signature unchanged) and `buildShape` uses
`effectiveVisible`, so a reaction-hidden field drops out of validation and a
reaction-shown field opts back in — automatically consistent with the renderer. `disabled`
remains render-only. Exhaustive `reactions.test.ts` plus two `validation.test.ts` cases.
