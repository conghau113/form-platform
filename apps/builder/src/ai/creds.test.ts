import { describe, expect, it } from "vitest";
import { aiHeaders } from "./creds";

describe("aiHeaders", () => {
  it("emits only the fields that are set", () => {
    expect(aiHeaders({ apiKey: "sk-123" })).toEqual({ "x-ai-api-key": "sk-123" });
  });

  it("maps every field to its x-ai-* header", () => {
    expect(
      aiHeaders({
        provider: "anthropic",
        apiKey: "k",
        baseUrl: "https://x/v1",
        model: "claude-sonnet-4-6",
      }),
    ).toEqual({
      "x-ai-provider": "anthropic",
      "x-ai-api-key": "k",
      "x-ai-base-url": "https://x/v1",
      "x-ai-model": "claude-sonnet-4-6",
    });
  });

  it("omits blank/whitespace-only values and trims the rest", () => {
    expect(aiHeaders({ apiKey: "  ", model: "  m  " })).toEqual({ "x-ai-model": "m" });
  });

  it("is empty when nothing is configured (server env fallback)", () => {
    expect(aiHeaders({})).toEqual({});
  });
});
