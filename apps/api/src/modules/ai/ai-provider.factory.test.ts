import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";
import { AiProviderFactory } from "./ai-provider.factory.js";

describe("AiProviderFactory", () => {
  const prevKey = process.env.AI_API_KEY;
  afterEach(() => {
    if (prevKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = prevKey;
  });

  it("throws 400 when no key is provided (header or AI_API_KEY)", () => {
    delete process.env.AI_API_KEY;
    const factory = new AiProviderFactory();
    expect(() => factory.create({ provider: "openai" })).toThrow(BadRequestException);
  });

  it("builds a provider for each kind when a key is present", () => {
    const factory = new AiProviderFactory();
    const openai = factory.create({ provider: "openai", apiKey: "sk-test" });
    const anthropic = factory.create({ provider: "anthropic", apiKey: "ak-test" });
    expect(typeof openai.complete).toBe("function");
    expect(typeof anthropic.complete).toBe("function");
  });

  it("falls back to the AI_PROVIDER default when no provider is given", () => {
    const prev = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = "anthropic";
    try {
      // Config is read at construction, so build the factory after setting the env.
      const factory = new AiProviderFactory();
      expect(typeof factory.create({ apiKey: "ak-test" }).complete).toBe("function");
    } finally {
      if (prev === undefined) delete process.env.AI_PROVIDER;
      else process.env.AI_PROVIDER = prev;
    }
  });
});
