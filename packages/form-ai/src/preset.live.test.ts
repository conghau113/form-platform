import { fieldNodeSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { providerFromEnv } from "./eval/run.js";
import { generatePreset } from "./preset.js";

/**
 * Opt-in LIVE preset eval (Track B headline: "one command designs a standard
 * reusable field"). Skipped unless a BYOK provider is configured via the same
 * `FORM_AI_EVAL_*` env the form eval uses, so CI never spends tokens. Each case
 * asserts the model produced a contract-clean preset whose `patch` re-builds a
 * valid field of `fieldType` — i.e. the guarantee, against a real model:
 *
 *   FORM_AI_EVAL_BASE_URL=… FORM_AI_EVAL_API_KEY=… FORM_AI_EVAL_MODEL=… \
 *     pnpm --filter @org/form-ai test -- preset.live
 */
const liveProvider = providerFromEnv();

// Natural-language prompts an operator would actually type; kept to two to bound spend.
const LIVE_CASES: { label: string; prompt: string }[] = [
  { label: "vn-phone", prompt: "Trường số điện thoại Việt Nam, bắt buộc, có validate định dạng." },
  { label: "company-email", prompt: "A required company email field with a helpful placeholder." },
];

describe.skipIf(!liveProvider)("generatePreset (live BYOK)", () => {
  for (const c of LIVE_CASES) {
    it(`designs a contract-valid preset: ${c.label}`, async () => {
      if (!liveProvider) return;
      const result = await generatePreset(liveProvider, { prompt: c.prompt });
      // biome-ignore lint/suspicious/noConsole: live CLI diagnostic, opt-in only.
      console.log(`[${c.label}] ok=${result.ok} attempts=${result.attempts}`);
      expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
      if (!result.ok) return;
      // biome-ignore lint/suspicious/noConsole: live CLI diagnostic, opt-in only.
      console.log(JSON.stringify(result.preset, null, 2));
      // The guarantee: the returned patch re-builds a valid field of fieldType.
      const field = { type: result.preset.fieldType, name: "preview", ...result.preset.patch };
      expect(fieldNodeSchema.safeParse(field).success).toBe(true);
    }, 300_000);
  }
});
