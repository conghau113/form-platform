---
"@org/form-ai": minor
---

Conversational refine + faithful image generation. New `refineForm(provider, input, options)`
applies a natural-language edit to an existing form (keeps field `name`s stable, re-validates
against the contract). New `imageStrategy: "single" | "two-pass"` option — `"two-pass"`
transcribes a reference image to a plain-text spec before building, for higher fidelity. The
system prompt gains a vision block (transcribe every field/label/type/option, preserve
structure) when images are present, the pipeline applies faithful defaults (temperature 0.3,
max tokens 8192), and the OpenAI-compatible provider requests `detail: "high"` images so small
screenshot text stays legible. All additive — no contract or `formVersion` change.
