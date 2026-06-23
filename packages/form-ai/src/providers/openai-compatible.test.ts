import { describe, expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "./openai-compatible.js";

/** Build a fake `fetch` that records the request and returns a canned response. */
function fakeFetch(responseContent: string) {
  const seen: { url: string; init: RequestInit } = { url: "", init: {} };
  const impl = (async (url: string, init: RequestInit) => {
    seen.url = url;
    seen.init = init;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ choices: [{ message: { content: responseContent } }] });
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, seen };
}

describe("createOpenAiCompatibleProvider", () => {
  it("posts chat/completions with auth + mapped messages and returns the content", async () => {
    const { impl, seen } = fakeFetch("hello");
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1/",
      apiKey: "sk-test",
      model: "gpt-x",
      fetchImpl: impl,
    });

    const result = await provider.complete({
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      jsonSchema: { type: "object" },
      temperature: 0.2,
    });

    expect(result.text).toBe("hello");
    expect(seen.url).toBe("https://example.test/v1/chat/completions");
    expect((seen.init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");

    const body = JSON.parse(seen.init.body as string);
    expect(body.model).toBe("gpt-x");
    expect(body.temperature).toBe(0.2);
    expect(body.messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "hi" }] });
    expect(body.response_format.type).toBe("json_schema");
    expect(body.stream).toBe(false);
  });

  it("throws a helpful error when the endpoint streams an SSE body", async () => {
    const impl = (async () =>
      ({
        ok: true,
        status: 200,
        async text() {
          return 'data: {"id":"x","choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
        },
      }) as Response) as unknown as typeof fetch;
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://x/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
    });
    await expect(
      provider.complete({ messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] }),
    ).rejects.toThrow(/streaming response/);
  });

  it("maps image content to image_url and skips response_format without a schema", async () => {
    const { impl, seen } = fakeFetch("ok");
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://example.test/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
    });

    await provider.complete({
      messages: [
        { role: "user", content: [{ type: "image", base64: "AAA", mediaType: "image/png" }] },
      ],
    });

    const body = JSON.parse(seen.init.body as string);
    expect(body.messages[0].content[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAA" },
    });
    expect(body.response_format).toBeUndefined();
  });

  it("throws on a non-ok response", async () => {
    const impl = (async () =>
      ({
        ok: false,
        status: 401,
        async text() {
          return "unauthorized";
        },
      }) as Response) as unknown as typeof fetch;
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://x/v1",
      apiKey: "k",
      model: "m",
      fetchImpl: impl,
    });
    await expect(
      provider.complete({ messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] }),
    ).rejects.toThrow(/401/);
  });
});
