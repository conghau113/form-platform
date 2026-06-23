import type { AiCompletionRequest, AiContent, AiMessage, AiProvider } from "../provider.js";

/**
 * Provider for any OpenAI-compatible Chat Completions endpoint — covers OpenAI,
 * Azure OpenAI, and the 9router dev/BYOK proxy. `fetchImpl` is injected (default
 * global `fetch`) so requests can be tested offline and so a host can supply an
 * auth-aware fetch; nothing here is hardcoded to a single vendor.
 */
export interface OpenAiCompatibleOptions {
  /** API base, e.g. `https://api.openai.com/v1` or the 9router URL. */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Injected fetch (default global `fetch`). */
  fetchImpl?: typeof fetch;
  /** Send `response_format: json_schema` when the request carries a schema (default true). */
  useResponseFormat?: boolean;
}

function toOpenAiContent(content: AiContent[]): unknown[] {
  return content.map((part) =>
    part.type === "text"
      ? { type: "text", text: part.text }
      : {
          type: "image_url",
          image_url: {
            url: part.url ?? `data:${part.mediaType ?? "image/png"};base64,${part.base64}`,
          },
        },
  );
}

function toOpenAiMessages(messages: AiMessage[]): unknown[] {
  return messages.map((m) => ({ role: m.role, content: toOpenAiContent(m.content) }));
}

async function readBody(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): AiProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;

  return {
    async complete(req: AiCompletionRequest) {
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: toOpenAiMessages(req.messages),
        // Force a single JSON response. Some OpenAI-compatible proxies (e.g.
        // 9router) stream by default, which would arrive as `data: …` SSE chunks
        // and break the JSON parse below.
        stream: false,
      };
      if (req.temperature != null) body.temperature = req.temperature;
      if (req.maxTokens != null) body.max_tokens = req.maxTokens;
      if (req.jsonSchema && opts.useResponseFormat !== false) {
        body.response_format = {
          type: "json_schema",
          json_schema: { name: "form_schema", schema: req.jsonSchema },
        };
      }

      const resp = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        throw new Error(`OpenAI-compatible request failed: ${resp.status} ${await readBody(resp)}`);
      }

      const raw = await readBody(resp);
      let json: { choices?: { message?: { content?: unknown } }[] };
      try {
        json = JSON.parse(raw);
      } catch {
        const hint = raw.startsWith("data:")
          ? " (the endpoint returned a streaming response; this provider expects a single JSON body)"
          : "";
        throw new Error(`OpenAI-compatible response was not JSON${hint}: ${raw.slice(0, 200)}`);
      }
      const content = json.choices?.[0]?.message?.content ?? "";
      return { text: typeof content === "string" ? content : JSON.stringify(content) };
    },
  };
}
