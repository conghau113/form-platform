import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic.js";

function fakeFetch(blocks: { type: string; text?: string }[]) {
  const seen: { url: string; init: RequestInit } = { url: "", init: {} };
  const impl = (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return {
      ok: true,
      status: 200,
      async json() {
        return { content: blocks };
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, seen };
}

describe("createAnthropicProvider", () => {
  it("hoists system, maps messages, sets headers, and concatenates text blocks", async () => {
    const { impl, seen } = fakeFetch([
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ]);
    const provider = createAnthropicProvider({
      apiKey: "ak",
      model: "claude-opus-4-8",
      fetchImpl: impl,
    });

    const result = await provider.complete({
      messages: [
        { role: "system", content: [{ type: "text", text: "be terse" }] },
        { role: "user", content: [{ type: "text", text: "hi" }] },
      ],
      maxTokens: 1000,
    });

    expect(result.text).toBe("Hello world");
    expect(seen.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = seen.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("ak");
    expect(headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(seen.init.body as string);
    expect(body.system).toBe("be terse");
    expect(body.max_tokens).toBe(1000);
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "hi" }] }]);
  });

  it("maps base64 and url images to Anthropic source blocks", async () => {
    const { impl, seen } = fakeFetch([{ type: "text", text: "ok" }]);
    const provider = createAnthropicProvider({ apiKey: "k", model: "m", fetchImpl: impl });

    await provider.complete({
      messages: [
        {
          role: "user",
          content: [
            { type: "image", base64: "AAA", mediaType: "image/jpeg" },
            { type: "image", url: "https://img.test/a.png" },
          ],
        },
      ],
    });

    const body = JSON.parse(seen.init.body as string);
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AAA" },
    });
    expect(body.messages[0].content[1]).toEqual({
      type: "image",
      source: { type: "url", url: "https://img.test/a.png" },
    });
  });
});
