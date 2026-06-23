import type { AiMessage, AiProvider } from "./provider.js";

/**
 * The domain-agnostic generate → validate → repair loop.
 *
 * Extracted from the form pipeline so every guaranteed-valid AI surface (forms,
 * workflows, …) shares ONE loop. The loop never knows what it is building: the
 * caller injects a `normalize` that turns a raw draft into a typed value or
 * structured errors, plus the JSON Schema to hand the provider and the repair
 * message to feed back. The model is never trusted — its output is re-validated
 * every round, and on failure the errors are sent back for a bounded number of
 * repair turns. No eval, no fetch, nothing platform-specific.
 */

/** Default repair rounds AFTER the first attempt (⇒ up to 4 model calls). */
const DEFAULT_MAX_REPAIRS = 3;
/** Low temperature keeps generation faithful/deterministic. */
const DEFAULT_TEMPERATURE = 0.3;
/** Generous cap so a detailed document is never truncated mid-JSON. */
const DEFAULT_MAX_TOKENS = 8192;

export type ExtractResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

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

/** Generic repair prompt. Domains may inject a more specific one via options. */
export function defaultRepairMessage(errors: string[]): string {
  return [
    "The JSON you returned failed validation. Fix these problems and return the COMPLETE corrected JSON object only (no prose, no code fences):",
    ...errors.map((e) => `- ${e}`),
  ].join("\n");
}

/** Turn a raw draft into a typed value, or structured errors to repair against. */
export type Normalizer<T> = (
  draft: unknown,
) => { ok: true; value: T } | { ok: false; errors: string[] };

export interface RunValidationLoopOptions {
  /** Repair rounds AFTER the first attempt (default 3 ⇒ up to 4 model calls). */
  maxRepairs?: number;
  temperature?: number;
  maxTokens?: number;
  /** JSON Schema handed to the provider for structured output (omit to skip). */
  jsonSchema?: Record<string, unknown>;
  /** Override the message fed back after a failed round (default {@link defaultRepairMessage}). */
  buildRepairMessage?: (errors: string[]) => string;
}

export type ValidationLoopResult<T> =
  | { ok: true; value: T; attempts: number; raw: string }
  | { ok: false; errors: string[]; attempts: number; raw?: string };

/**
 * Run the shared loop: call the provider, extract JSON, normalize (validate),
 * and on failure feed the errors back for up to `maxRepairs` more rounds. The
 * `normalize` callback owns ALL validity — Zod, graph checks, post-processing —
 * so adding a new domain means writing a normalizer, not changing this loop.
 *
 * `messages` is mutated in place across repair turns (assistant + user appended),
 * matching the original form pipeline; callers pass a fresh array per request.
 */
export async function runValidationLoop<T>(
  provider: AiProvider,
  messages: AiMessage[],
  normalize: Normalizer<T>,
  options: RunValidationLoopOptions = {},
): Promise<ValidationLoopResult<T>> {
  const totalAttempts = (options.maxRepairs ?? DEFAULT_MAX_REPAIRS) + 1;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const repair = options.buildRepairMessage ?? defaultRepairMessage;

  let lastRaw: string | undefined;
  let lastErrors: string[] = ["No response from provider."];

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const res = await provider.complete({
      messages,
      jsonSchema: options.jsonSchema,
      temperature,
      maxTokens,
    });
    lastRaw = res.text;

    const extracted = extractJsonObject(res.text);
    if (extracted.ok) {
      const normalized = normalize(extracted.value);
      if (normalized.ok) {
        return { ok: true, value: normalized.value, attempts: attempt, raw: res.text };
      }
      lastErrors = normalized.errors;
    } else {
      lastErrors = extracted.errors;
    }

    if (attempt < totalAttempts) {
      messages.push({ role: "assistant", content: [{ type: "text", text: res.text }] });
      messages.push({
        role: "user",
        content: [{ type: "text", text: repair(lastErrors) }],
      });
    }
  }

  return { ok: false, errors: lastErrors, attempts: totalAttempts, raw: lastRaw };
}
