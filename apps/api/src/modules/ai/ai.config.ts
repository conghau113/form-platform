/**
 * Server-side AI configuration, read from the environment. Keys are BYOK (sent
 * per-request as headers); these are only DEV fallbacks + non-secret defaults.
 * The provider itself is injectable (see {@link AiProviderFactory}) — nothing
 * here hardcodes a vendor into the request path.
 */
export interface AiServerConfig {
  /** Provider used when the request omits `x-ai-provider`. */
  defaultProvider: "openai" | "anthropic";
  /** Base URL for the OpenAI-compatible provider (OpenAI, Azure, or 9router). */
  openAiBaseUrl: string;
  openAiModel: string;
  anthropicModel: string;
  /** Dev-only API key fallback (`AI_API_KEY`) when the request omits the BYOK header. */
  apiKeyFallback?: string;
  /** Host allowlist for URLs baked into generated forms (`AI_URL_ALLOWLIST`, comma-separated). */
  urlAllowlist: string[];
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiServerConfig {
  return {
    defaultProvider: env.AI_PROVIDER === "anthropic" ? "anthropic" : "openai",
    openAiBaseUrl: env.AI_BASE_URL?.trim() || "https://api.openai.com/v1",
    openAiModel: env.AI_MODEL?.trim() || "gpt-4o-mini",
    anthropicModel: env.AI_ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6",
    apiKeyFallback: env.AI_API_KEY?.trim() || undefined,
    urlAllowlist: (env.AI_URL_ALLOWLIST ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
  };
}
