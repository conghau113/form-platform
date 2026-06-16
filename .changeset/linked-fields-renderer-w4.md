---
"@org/form-renderer-web": minor
---

Add an optional `presetResolver` prop to `FormRenderer` (Track W4 — linked fields). When
provided, fields carrying a `presetId` are re-synced via form-core's `resolveLinkedFields`
after `migrate()`. Absent ⇒ linked fields render from their own props (a frozen snapshot), so
runtime output is unchanged and the renderer stays usable with no preset source injected.
