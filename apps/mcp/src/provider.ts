import {
  type AiProvider,
  createAnthropicProvider,
  createOpenAiCompatibleProvider,
} from "@org/form-ai";

/**
 * The LLM provider seam for the `generate_*` MCP tools.
 *
 * MCP runs over stdio with no per-request headers, so credentials come from the
 * server's environment — the MCP host (Claude Desktop, the Agent SDK, …) sets
 * them when it launches this process. We return a discriminated result rather
 * than throwing so a missing key surfaces as a tool error, not a crashed server
 * (discovery + the no-LLM `create_*` tools must keep working without creds).
 */

export type ProviderResolution = { ok: true; provider: AiProvider } | { ok: false; error: string };

/** A function the server calls to obtain a provider per generate request. */
export type ResolveProvider = () => ProviderResolution;

/** Build the provider from environment variables (the default {@link ResolveProvider}). */
export function resolveProviderFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  const apiKey = env.AI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Missing AI API key — set AI_API_KEY (and optionally AI_PROVIDER, AI_BASE_URL, AI_MODEL) in the MCP server environment.",
    };
  }

  if (env.AI_PROVIDER === "anthropic") {
    const baseUrl = env.AI_BASE_URL?.trim();
    return {
      ok: true,
      provider: createAnthropicProvider({
        apiKey,
        model: env.AI_ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6",
        ...(baseUrl ? { baseUrl } : {}),
      }),
    };
  }

  return {
    ok: true,
    provider: createOpenAiCompatibleProvider({
      baseUrl: env.AI_BASE_URL?.trim() || "https://api.openai.com/v1",
      apiKey,
      model: env.AI_MODEL?.trim() || "gpt-4o-mini",
    }),
  };
}
