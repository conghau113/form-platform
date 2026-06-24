import type { PresetDraft } from "@org/form-ai";
import { type AiCreds, aiHeaders } from "../../ai/creds";
import { ownerHeaders } from "../../workspace/config";
import { API_BASE } from "../config";

/**
 * Thin client for the headless `POST /ai/presets/generate` endpoint — the only
 * place a `fetch` for AI preset generation is allowed. BYOK credentials ride as
 * `x-ai-*` headers (reusing the form generator's `creds` seam); the body is the
 * request envelope. The server validates the preset with Zod (its `patch` must
 * build a valid field) and never trusts it. A non-OK response throws with the
 * server's message, including the structured `errors` on a 422.
 */

export interface GeneratePresetInput {
  prompt: string;
  /** Optional hint constraining the field type (e.g. "text", "select"). */
  fieldType?: string;
  guidance?: string;
  /** Repair rounds after the first attempt (0–5; server default 3). */
  maxRepairs?: number;
}

export interface GeneratePresetResult {
  preset: PresetDraft;
  /** Model calls it took (1 = valid on the first try). */
  attempts: number;
  /** URLs the server's output allowlist stripped from the preset patch. */
  strippedUrls: string[];
}

interface ErrorBody {
  message?: string;
  errors?: string[];
}

export async function generatePreset(
  input: GeneratePresetInput,
  creds: AiCreds,
): Promise<GeneratePresetResult> {
  const res = await fetch(`${API_BASE}/ai/presets/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...ownerHeaders(), ...aiHeaders(creds) },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as ErrorBody;
    const detail = data.errors?.length ? `: ${data.errors.join("; ")}` : "";
    throw new Error(`${data.message ?? `Preset generation failed (${res.status})`}${detail}`);
  }
  return (await res.json()) as GeneratePresetResult;
}
