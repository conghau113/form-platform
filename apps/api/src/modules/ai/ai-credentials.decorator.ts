import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

/**
 * BYOK credentials for an AI request, read from headers so the caller's key never
 * touches our storage:
 * - `x-ai-provider`: `openai` (default, OpenAI-compatible) or `anthropic`
 * - `x-ai-api-key`:  the caller's key (falls back to `AI_API_KEY` for dev)
 * - `x-ai-base-url`: OpenAI-compatible base URL override (e.g. 9router/Azure)
 * - `x-ai-model`:    model id override
 */
export interface AiCredentials {
  /** Absent ⇒ the factory falls back to the server's `AI_PROVIDER` default. */
  provider?: "openai" | "anthropic";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

export const AiCreds = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AiCredentials => {
    const req = ctx.switchToHttp().getRequest<RequestWithHeaders>();
    const header = (key: string): string | undefined => {
      const value = req.headers[key];
      const raw = Array.isArray(value) ? value[0] : value;
      return raw?.trim() || undefined;
    };
    const provider = header("x-ai-provider")?.toLowerCase();
    return {
      provider:
        provider === "anthropic" ? "anthropic" : provider === "openai" ? "openai" : undefined,
      apiKey: header("x-ai-api-key"),
      baseUrl: header("x-ai-base-url"),
      model: header("x-ai-model"),
    };
  },
);
