---
"@org/form-ai": minor
---

Add `@org/form-ai` — the AI core for generating contract-valid forms from a
prompt (AI-agent-native P1, slice 1). Dependency-light (form-schema + zod only),
runs on server and browser, no `react`/`antd`.

- `AiProvider` interface: the single injectable seam (text + vision messages),
  the same philosophy as the renderer's `fetcher` prop. No SDK is bundled.
- `providers/openai-compatible.ts` (OpenAI / Azure / 9router) and
  `providers/anthropic.ts` — thin fetch wrappers with an injected `fetchImpl`,
  so requests are unit-tested offline and never hardcoded to one vendor.
- `generateForm()` pipeline: `generate → extract JSON → normalize (migrate + Zod)
  → repair (≤N rounds, feeding Zod errors back) → postprocess`. Output is either
  a parse-valid `FormSchema` or structured errors — no eval, guaranteed valid.
- `dedupeFieldNames()` postprocess + a prompt builder embedding the live field
  capability catalog. The HTTP endpoint (`POST /ai/forms:generate`) lands in P1
  slice 2.
