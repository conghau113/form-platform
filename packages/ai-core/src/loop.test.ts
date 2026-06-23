import { describe, expect, it } from "vitest";
import { extractJsonObject, runValidationLoop } from "./loop.js";
import type { AiCompletionRequest, AiProvider } from "./provider.js";

/** A provider that replays scripted responses and records the requests it saw. */
function scriptedProvider(responses: string[]): AiProvider & { calls: AiCompletionRequest[] } {
  const calls: AiCompletionRequest[] = [];
  let i = 0;
  return {
    calls,
    async complete(req) {
      calls.push(req);
      const text = responses[Math.min(i, responses.length - 1)];
      i++;
      return { text };
    },
  };
}

/** A trivial normalizer: accept any object with a numeric `n`, else report errors. */
function normalizeN(
  draft: unknown,
): { ok: true; value: { n: number } } | { ok: false; errors: string[] } {
  if (draft && typeof draft === "object" && typeof (draft as { n?: unknown }).n === "number") {
    return { ok: true, value: { n: (draft as { n: number }).n } };
  }
  return { ok: false, errors: ['expected a numeric "n"'] };
}

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("strips ```json fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("recovers JSON embedded in prose", () => {
    expect(extractJsonObject('Here you go: {"a":1} done')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("reports an error for non-JSON", () => {
    const r = extractJsonObject("nope");
    expect(r.ok).toBe(false);
  });
});

describe("runValidationLoop", () => {
  it("returns the normalized value on the first valid response", async () => {
    const provider = scriptedProvider(['{"n":1}']);
    const result = await runValidationLoop(provider, [], normalizeN);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(1);
    expect(result.value).toEqual({ n: 1 });
  });

  it("feeds normalize errors back and repairs on a later round", async () => {
    const provider = scriptedProvider(['{"x":true}', '{"n":2}']);
    const result = await runValidationLoop(provider, [], normalizeN);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    // The repair turn replays the failed draft + an error-laden user message.
    expect(provider.calls).toHaveLength(2);
    const repairTurn = provider.calls[1].messages;
    expect(repairTurn.some((m) => m.role === "assistant")).toBe(true);
    expect(
      repairTurn
        .filter((m) => m.role === "user")
        .flatMap((m) => m.content)
        .some((c) => c.type === "text" && c.text.includes('numeric "n"')),
    ).toBe(true);
  });

  it("gives up after maxRepairs with structured errors", async () => {
    const provider = scriptedProvider(["not json at all"]);
    const result = await runValidationLoop(provider, [], normalizeN, { maxRepairs: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.attempts).toBe(3); // 1 + 2 repairs
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("hands the JSON Schema to the provider when supplied", async () => {
    const provider = scriptedProvider(['{"n":1}']);
    const schema = { type: "object" } as const;
    await runValidationLoop(provider, [], normalizeN, { jsonSchema: schema });
    expect(provider.calls[0].jsonSchema).toBe(schema);
  });

  it("uses an injected repair message when provided", async () => {
    const provider = scriptedProvider(["bad", '{"n":1}']);
    await runValidationLoop(provider, [], normalizeN, {
      buildRepairMessage: () => "CUSTOM REPAIR",
    });
    const repairTurn = provider.calls[1].messages;
    expect(
      repairTurn
        .filter((m) => m.role === "user")
        .flatMap((m) => m.content)
        .some((c) => c.type === "text" && c.text === "CUSTOM REPAIR"),
    ).toBe(true);
  });
});
