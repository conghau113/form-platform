---
"@org/form-ai": minor
---

Add guaranteed-valid preset generation (AI-agent-native P2, Track B slice 1) — the
core that lets one prompt design a reusable, contract-valid field template.

- `preset.ts` — `generatePreset(provider, input, options)` reuses the shared
  `@org/ai-core` validate→repair loop with a preset normalizer. `normalizePresetDraft`
  proves the model's `patch` by building a synthetic field of `fieldType` and parsing it
  against `fieldNodeSchema`; the accepted `patch` is re-derived from the parsed node, so
  it carries only contract-clean props (unknown keys dropped, prop types checked).
  Presets are leaf-only (container `fieldType`s are rejected). Returns a `PresetDraft`
  (`{ name, fieldType, icon?, patch }`); id/scope are assigned by the caller at save.
- `preset-prompt.ts` — system prompt embedding the leaf field catalog plus the contract's
  real validation shape (regex in `value`, named `format`s), with an optional `fieldType`
  constraint and a preset-specific repair message.
- `sanitize.ts` — `stripPresetUrls(draft, allowlist)` mirrors `stripDisallowedUrls` for a
  single field (drops an off-allowlist `patch.dataSource.url`); `hostAllowed` is now exported.

No eval, no fetch in the package; additive (no formVersion bump).
