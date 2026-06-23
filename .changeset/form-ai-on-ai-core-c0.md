---
"@org/form-ai": minor
---

Build `@org/form-ai` on the new `@org/ai-core` (P3 / Track C, phase C0). Internal
refactor, public surface preserved.

- The provider seam, the two provider impls, `extractJsonObject`, and the
  generate→validate→repair loop moved to `@org/ai-core`. `form-ai` now supplies
  only the form-specific pieces (prompts, the migrate+Zod+dedupe normalizer, the
  form JSON Schema) and drives the shared `runValidationLoop`.
- `stripDisallowedUrls` stays here: it is form-contract-specific, not vendor-neutral.
- Back-compat: `index.ts` re-exports `@org/ai-core`, so existing imports
  (`AiProvider`, `createOpenAiCompatibleProvider`, `createAnthropicProvider`,
  `extractJsonObject`) keep resolving from `@org/form-ai`.
