import { FORM_JSON_SCHEMA, type FormSchema } from "@org/form-schema";
import { normalizeFormDraft } from "./normalize.js";
import { dedupeFieldNames } from "./postprocess.js";
import {
  buildFormGenerationMessages,
  buildImageTranscriptionMessages,
  buildRefineMessages,
  buildRepairMessage,
  type GenerateFormInput,
  type RefineFormInput,
} from "./prompt.js";
import type { AiMessage, AiProvider } from "./provider.js";

/**
 * P1 — the guaranteed-valid generation pipeline.
 *
 * `generate → extract JSON → normalize (migrate + Zod) → repair (≤N) → postprocess`.
 * The model is never trusted: its output is re-validated against the contract,
 * and on failure the Zod errors are fed back for a bounded number of repair
 * rounds. The result is either a parse-valid `FormSchema` or structured errors —
 * no eval, no fetch, nothing platform-specific.
 */

/** Low temperature keeps generation faithful/deterministic (esp. image transcription). */
const DEFAULT_TEMPERATURE = 0.3;
/** Generous cap so a detailed form is never truncated mid-JSON (which forces repairs). */
const DEFAULT_MAX_TOKENS = 8192;

/** How a reference image is turned into a form. */
export type ImageStrategy = "single" | "two-pass";

export interface GenerateFormOptions {
  /** Repair rounds AFTER the first attempt (default 3 ⇒ up to 4 model calls). */
  maxRepairs?: number;
  temperature?: number;
  maxTokens?: number;
  /** Pass the form JSON Schema to the provider for structured output (default true). */
  useJsonSchema?: boolean;
  /**
   * Image handling (default `"single"`). `"two-pass"` first transcribes the image
   * to a plain-text spec, then builds from it — higher fidelity, one extra call.
   * Ignored when there are no images.
   */
  imageStrategy?: ImageStrategy;
}

export interface GenerateFormSuccess {
  ok: true;
  form: FormSchema;
  /** How many model calls it took (1 = valid on first try). */
  attempts: number;
  /** Raw text of the accepted response. */
  raw: string;
}

export interface GenerateFormFailure {
  ok: false;
  errors: string[];
  attempts: number;
  raw?: string;
}

export type GenerateFormResult = GenerateFormSuccess | GenerateFormFailure;

type ExtractResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

/**
 * Pull a JSON object out of raw model text. Tolerates ```json fences and
 * surrounding prose by falling back to the outermost `{ … }` span.
 */
export function extractJsonObject(text: string): ExtractResult {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const tryParse = (s: string): ExtractResult | null => {
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch {
      return null;
    }
  };

  const direct = tryParse(unfenced);
  if (direct) return direct;

  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const span = tryParse(unfenced.slice(start, end + 1));
    if (span) return span;
  }
  return { ok: false, errors: ["Response was not valid JSON."] };
}

/**
 * Shared generate→validate→repair loop. Both `generateForm` and `refineForm`
 * seed it with their own messages; everything past the first call (JSON extract,
 * Zod normalize, bounded repair) is identical.
 */
async function runValidationLoop(
  provider: AiProvider,
  messages: AiMessage[],
  options: GenerateFormOptions,
): Promise<GenerateFormResult> {
  const totalAttempts = (options.maxRepairs ?? 3) + 1;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  let lastRaw: string | undefined;
  let lastErrors: string[] = ["No response from provider."];

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const res = await provider.complete({
      messages,
      jsonSchema: options.useJsonSchema === false ? undefined : FORM_JSON_SCHEMA,
      temperature,
      maxTokens,
    });
    lastRaw = res.text;

    const extracted = extractJsonObject(res.text);
    if (extracted.ok) {
      const normalized = normalizeFormDraft(extracted.value);
      if (normalized.ok) {
        return {
          ok: true,
          form: dedupeFieldNames(normalized.value),
          attempts: attempt,
          raw: res.text,
        };
      }
      lastErrors = normalized.errors;
    } else {
      lastErrors = extracted.errors;
    }

    if (attempt < totalAttempts) {
      messages.push({ role: "assistant", content: [{ type: "text", text: res.text }] });
      messages.push({
        role: "user",
        content: [{ type: "text", text: buildRepairMessage(lastErrors) }],
      });
    }
  }

  return { ok: false, errors: lastErrors, attempts: totalAttempts, raw: lastRaw };
}

/** Generate a contract-valid form from a prompt (and optional images). */
export async function generateForm(
  provider: AiProvider,
  input: GenerateFormInput,
  options: GenerateFormOptions = {},
): Promise<GenerateFormResult> {
  let messages = buildFormGenerationMessages(input);

  // Two-pass: read the image into a plain-text spec first, then build from it.
  if (options.imageStrategy === "two-pass" && (input.images?.length ?? 0) > 0) {
    const transcription = await provider.complete({
      messages: buildImageTranscriptionMessages(input),
      // Free-text spec, NOT a form — never constrain this pass to the JSON schema.
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
    const spec = transcription.text.trim();
    if (spec) {
      const guidance = [
        input.guidance,
        `Transcription of the reference image — build the form to match this exactly:\n${spec}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      messages = buildFormGenerationMessages({ ...input, guidance });
    }
  }

  return runValidationLoop(provider, messages, options);
}

/** Apply a natural-language edit to an existing form, returning a contract-valid result. */
export async function refineForm(
  provider: AiProvider,
  input: RefineFormInput,
  options: GenerateFormOptions = {},
): Promise<GenerateFormResult> {
  return runValidationLoop(provider, buildRefineMessages(input), options);
}
