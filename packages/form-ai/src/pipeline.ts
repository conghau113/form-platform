import { FORM_JSON_SCHEMA, type FormSchema } from "@org/form-schema";
import { normalizeFormDraft } from "./normalize.js";
import { dedupeFieldNames } from "./postprocess.js";
import {
  buildFormGenerationMessages,
  buildRepairMessage,
  type GenerateFormInput,
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

export interface GenerateFormOptions {
  /** Repair rounds AFTER the first attempt (default 3 ⇒ up to 4 model calls). */
  maxRepairs?: number;
  temperature?: number;
  maxTokens?: number;
  /** Pass the form JSON Schema to the provider for structured output (default true). */
  useJsonSchema?: boolean;
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

/** Generate a contract-valid form from a prompt (and optional images). */
export async function generateForm(
  provider: AiProvider,
  input: GenerateFormInput,
  options: GenerateFormOptions = {},
): Promise<GenerateFormResult> {
  const totalAttempts = (options.maxRepairs ?? 3) + 1;
  const messages: AiMessage[] = buildFormGenerationMessages(input);

  let lastRaw: string | undefined;
  let lastErrors: string[] = ["No response from provider."];

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const res = await provider.complete({
      messages,
      jsonSchema: options.useJsonSchema === false ? undefined : FORM_JSON_SCHEMA,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
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
