import type { AiCompletionRequest, AiContent, AiMessage, AiProvider } from "../provider.js";

/**
 * Provider for Anthropic's Messages API (default target: Claude Opus 4.8 /
 * Sonnet 4.6). System messages are hoisted to the top-level `system` field and
 * image parts become `image` content blocks. Structured output via JSON Schema
 * is not requested here — the prompt instructs JSON and the pipeline re-validates
 * — keeping this provider a thin, testable fetch wrapper.
 */
export interface AnthropicOptions {
  apiKey: string;
  model: string;
  /** API base (default `https://api.anthropic.com`). */
  baseUrl?: string;
  /** Injected fetch (default global `fetch`). */
  fetchImpl?: typeof fetch;
  /** Anthropic requires `max_tokens`; used when the request omits it (default 4096). */
  maxTokens?: number;
  /** `anthropic-version` header (default `2023-06-01`). */
  version?: string;
}

function textOf(message: AiMessage): string {
  return message.content
    .filter((p): p is Extract<AiContent, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function toAnthropicBlock(part: AiContent): unknown {
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.url) return { type: "image", source: { type: "url", url: part.url } };
  return {
    type: "image",
    source: { type: "base64", media_type: part.mediaType ?? "image/png", data: part.base64 },
  };
}

async function readBody(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

export function createAnthropicProvider(opts: AnthropicOptions): AiProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `${(opts.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`;

  return {
    async complete(req: AiCompletionRequest) {
      const system = req.messages
        .filter((m) => m.role === "system")
        .map(textOf)
        .filter(Boolean)
        .join("\n\n");
      const messages = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content.map(toAnthropicBlock) }));

      const body: Record<string, unknown> = {
        model: opts.model,
        max_tokens: req.maxTokens ?? opts.maxTokens ?? 4096,
        messages,
      };
      if (system) body.system = system;
      if (req.temperature != null) body.temperature = req.temperature;

      const resp = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": opts.apiKey,
          "anthropic-version": opts.version ?? "2023-06-01",
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        throw new Error(`Anthropic request failed: ${resp.status} ${await readBody(resp)}`);
      }

      const json = (await resp.json()) as { content?: { type?: string; text?: string }[] };
      const text = (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      return { text };
    },
  };
}
