---
"@org/ai-core": minor
---

Add `@org/ai-core` — the vendor-neutral AI runtime shared by every
guaranteed-valid generation surface (forms now, workflows next; P3 / Track C,
phase C0). Extracted from `@org/form-ai` with zero behavior change. No runtime
deps, no `react`/`antd`; runs on server and browser.

- `provider.ts`: the `AiProvider` injectable seam (text + vision messages) — the
  single place an LLM is called, the same philosophy as the renderer's `fetcher`.
- `providers/openai-compatible.ts` (OpenAI / Azure / 9router) and
  `providers/anthropic.ts` — thin fetch wrappers with an injected `fetchImpl`.
- `loop.ts`: `extractJsonObject`, `defaultRepairMessage`, and the domain-agnostic
  `runValidationLoop<T>(provider, messages, normalize, options)`. The injected
  `normalize` owns all validity (Zod, graph checks, post-processing), so a new
  domain means writing a normalizer — not changing the loop. No eval.
