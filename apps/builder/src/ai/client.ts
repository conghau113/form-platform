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
export interface GenerateFormInput {
  prompt: string;
  guidance?: string;
  images?: { url?: string; base64?: string; mediaType?: string }[];
  /** Repair rounds after the first attempt (0–5; server default 3). */
  maxRepairs?: number;
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

export async function generateForm(
  input: GenerateFormInput,
  creds: AiCreds,
): Promise<GenerateFormResult> {
  const res = await fetch(`${API_BASE}/ai/forms/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ownerHeaders(), ...aiHeaders(creds) },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ErrorBody;
    const detail = data.errors?.length ? `: ${data.errors.join("; ")}` : "";
    throw new Error(`${data.message ?? `Generation failed (${res.status})`}${detail}`);
  }
  return (await res.json()) as GenerateFormResult;
}
