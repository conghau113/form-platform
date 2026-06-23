import { type AiMessage, type AiProvider, runValidationLoop } from "@org/ai-core";
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

/**
 * P1 — the guaranteed-valid form generation pipeline.
 *
 * The shared `generate → extract → normalize → repair` machinery now lives in
 * `@org/ai-core` (`runValidationLoop`); this module supplies the form-specific
 * pieces: the prompts, the normalizer (migrate + Zod + dedupe), and the form
 * JSON Schema. The model is never trusted: its output is re-validated against the
 * contract, and on failure the Zod errors are fed back for a bounded number of
 * repair rounds. The result is either a parse-valid `FormSchema` or structured
 * errors — no eval, no fetch, nothing platform-specific.
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

/** Normalize a draft into a contract-valid form, deduping field names on success. */
function normalizeForm(
  draft: unknown,
): { ok: true; value: FormSchema } | { ok: false; errors: string[] } {
  const normalized = normalizeFormDraft(draft);
  return normalized.ok ? { ok: true, value: dedupeFieldNames(normalized.value) } : normalized;
}

/** Drive the shared loop with the form normalizer and map its result to the public shape. */
async function runFormLoop(
  provider: AiProvider,
  messages: AiMessage[],
  options: GenerateFormOptions,
): Promise<GenerateFormResult> {
  const result = await runValidationLoop<FormSchema>(provider, messages, normalizeForm, {
    maxRepairs: options.maxRepairs,
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    jsonSchema: options.useJsonSchema === false ? undefined : FORM_JSON_SCHEMA,
    buildRepairMessage,
  });
  return result.ok
    ? { ok: true, form: result.value, attempts: result.attempts, raw: result.raw }
    : { ok: false, errors: result.errors, attempts: result.attempts, raw: result.raw };
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

  return runFormLoop(provider, messages, options);
}

/** Apply a natural-language edit to an existing form, returning a contract-valid result. */
export async function refineForm(
  provider: AiProvider,
  input: RefineFormInput,
  options: GenerateFormOptions = {},
): Promise<GenerateFormResult> {
  return runFormLoop(provider, buildRefineMessages(input), options);
}
