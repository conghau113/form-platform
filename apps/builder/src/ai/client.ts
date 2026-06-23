import type { FormSchema } from "@org/form-schema";
import { API_BASE } from "../presets/config";
import { ownerHeaders } from "../workspace/config";
import { type AiCreds, aiHeaders } from "./creds";

/**
 * Thin client for the headless `POST /ai/forms/generate` endpoint. The only
 * place a `fetch` for AI generation is allowed. BYOK credentials ride as
 * `x-ai-*` headers; the body is the request envelope (the server validates the
 * generated form with Zod and never trusts it). A non-OK response throws with
 * the server's message, including the structured `errors` on a 422.
 */
/** How a reference image is turned into a form (mirrors the server `ImageStrategy`). */
export type ImageStrategy = "single" | "two-pass";

interface AiImage {
  url?: string;
  base64?: string;
  mediaType?: string;
}

export interface GenerateFormInput {
  prompt: string;
  guidance?: string;
  images?: AiImage[];
  /** Repair rounds after the first attempt (0–5; server default 3). */
  maxRepairs?: number;
  /** `"two-pass"` transcribes an attached image first for higher fidelity. */
  imageStrategy?: ImageStrategy;
}

export interface RefineFormInput {
  /** The form being edited (the current canvas form). */
  baseForm: FormSchema;
  /** What to change, in natural language. */
  instruction: string;
  guidance?: string;
  images?: AiImage[];
  maxRepairs?: number;
  imageStrategy?: ImageStrategy;
}

export interface GenerateFormResult {
  form: FormSchema;
  /** Model calls it took (1 = valid on the first try). */
  attempts: number;
  /** URLs the server's output allowlist stripped from the form. */
  strippedUrls: string[];
}

interface ErrorBody {
  message?: string;
  errors?: string[];
}

/** POST a request envelope to an AI endpoint, throwing the server's reason on failure. */
async function postAi(
  path: string,
  body: unknown,
  creds: AiCreds,
  fallback: string,
): Promise<GenerateFormResult> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ownerHeaders(), ...aiHeaders(creds) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ErrorBody;
    const detail = data.errors?.length ? `: ${data.errors.join("; ")}` : "";
    throw new Error(`${data.message ?? `${fallback} (${res.status})`}${detail}`);
  }
  return (await res.json()) as GenerateFormResult;
}

export function generateForm(
  input: GenerateFormInput,
  creds: AiCreds,
): Promise<GenerateFormResult> {
  return postAi("/ai/forms/generate", input, creds, "Generation failed");
}

export function refineForm(input: RefineFormInput, creds: AiCreds): Promise<GenerateFormResult> {
  return postAi("/ai/forms/refine", input, creds, "Refine failed");
}
