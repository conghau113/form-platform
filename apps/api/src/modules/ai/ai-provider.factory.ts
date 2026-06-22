import { BadRequestException, Injectable } from "@nestjs/common";
import {
  type AiProvider,
  createAnthropicProvider,
  createOpenAiCompatibleProvider,
} from "@org/form-ai";
import { type AiServerConfig, loadAiConfig } from "./ai.config.js";
import type { AiCredentials } from "./ai-credentials.decorator.js";

/**
 * Builds the concrete {@link AiProvider} for a request from its BYOK credentials,
 * falling back to server config for non-secret defaults. This is the single place
 * that maps "provider kind" → SDK-free fetch wrapper, so the service and tests
 * depend on the seam, not on a vendor. Injectable so tests can substitute a
 * scripted provider.
 */
@Injectable()
export class AiProviderFactory {
  private readonly config: AiServerConfig = loadAiConfig();

  create(creds: AiCredentials): AiProvider {
    const apiKey = creds.apiKey ?? this.config.apiKeyFallback;
    if (!apiKey) {
      throw new BadRequestException(
        "Missing AI API key — send it as the `x-ai-api-key` header (or set AI_API_KEY).",
      );
    }
    const provider = creds.provider ?? this.config.defaultProvider;
    if (provider === "anthropic") {
      return createAnthropicProvider({
        apiKey,
        model: creds.model ?? this.config.anthropicModel,
      });
    }
    return createOpenAiCompatibleProvider({
      baseUrl: creds.baseUrl ?? this.config.openAiBaseUrl,
      apiKey,
      model: creds.model ?? this.config.openAiModel,
    });
  }
}
