---
"@org/form-core": minor
---

Add `resolveLinkedFields(form, resolver)` (Track W4 — linked fields). It re-syncs every field
carrying a `presetId` against an injected `PresetResolver` (preset `patch` base, instance
`overrides` on top), and reports `missing`/`mismatched` preset ids so the host can flag stale
links. Pure and declarative — no fetching, no `eval`; presets stay outside the form contract.
