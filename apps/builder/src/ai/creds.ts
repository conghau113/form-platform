/**
 * BYOK credentials for the AI generate endpoint, kept on the client only.
 *
 * The builder never stores keys on the server: the user's key lives in
 * `localStorage` and is sent per-request as `x-ai-*` headers, exactly the seam
 * the api's `@AiCreds()` decorator reads. Every field is optional — a blank
 * field falls back to the server's own `AI_*` env defaults (dev convenience),
 * so a developer with a configured server can generate without entering a key.
 */
export interface AiCreds {
  provider?: "openai" | "anthropic";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

const STORAGE_KEY = "form-builder:ai-creds";

/** Read the saved BYOK credentials (empty object when unset or unparsable). */
export function loadAiCreds(): AiCreds {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AiCreds) : {};
  } catch {
    return {};
  }
}

/** Persist the BYOK credentials for next time. */
export function saveAiCreds(creds: AiCreds): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

/** Map credentials to the `x-ai-*` request headers, omitting blanks so the
 *  server falls back to its env defaults for anything the user left empty. */
export function aiHeaders(creds: AiCreds): Record<string, string> {
  const headers: Record<string, string> = {};
  if (creds.provider) headers["x-ai-provider"] = creds.provider;
  if (creds.apiKey?.trim()) headers["x-ai-api-key"] = creds.apiKey.trim();
  if (creds.baseUrl?.trim()) headers["x-ai-base-url"] = creds.baseUrl.trim();
  if (creds.model?.trim()) headers["x-ai-model"] = creds.model.trim();
  return headers;
}
