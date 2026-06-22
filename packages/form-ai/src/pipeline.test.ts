import { describe, expect, it } from "vitest";
import { extractJsonObject, generateForm } from "./pipeline.js";
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

const validForm = JSON.stringify({
  id: "contact",
  title: "Contact",
  fields: [
    { type: "text", name: "full_name", label: "Full name" },
    { type: "text", name: "email", label: "Email" },
  ],
});

describe("generateForm", () => {
  it("returns a contract-valid form on the first attempt", async () => {
    const provider = scriptedProvider([validForm]);
    const result = await generateForm(provider, { prompt: "a contact form" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(1);
    expect(result.form.formVersion).toBe(3);
    expect(result.form.fields).toHaveLength(2);
  });

  it("repairs an invalid draft using a follow-up round", async () => {
    // First reply is missing the required `title`; second is valid.
    const invalid = JSON.stringify({ id: "x", fields: [] });
    const provider = scriptedProvider([invalid, validForm]);

    const result = await generateForm(provider, { prompt: "a contact form" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    // The repair turn replays the failed draft + an error-laden user message.
    expect(provider.calls).toHaveLength(2);
    const repairTurn = provider.calls[1].messages;
    expect(repairTurn.some((m) => m.role === "assistant")).toBe(true);
  });

  it("gives up after maxRepairs and reports structured errors", async () => {
    const provider = scriptedProvider(["not json at all"]);
    const result = await generateForm(provider, { prompt: "x" }, { maxRepairs: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.attempts).toBe(3); // 1 + 2 repairs
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("tolerates a fenced code block around the JSON", async () => {
    const provider = scriptedProvider(["```json\n" + validForm + "\n```"]);
    const result = await generateForm(provider, { prompt: "x" });
    expect(result.ok).toBe(true);
  });

  it("deduplicates colliding field names in the accepted form", async () => {
    const dupes = JSON.stringify({
      id: "f",
      title: "F",
      fields: [
        { type: "text", name: "email", label: "A" },
        { type: "text", name: "email", label: "B" },
      ],
    });
    const provider = scriptedProvider([dupes]);
    const result = await generateForm(provider, { prompt: "x" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form.fields.map((f) => ("name" in f ? f.name : undefined))).toEqual([
      "email",
      "email_2",
    ]);
  });

  it("passes the form JSON Schema to the provider by default", async () => {
    const provider = scriptedProvider([validForm]);
    await generateForm(provider, { prompt: "x" });
    expect(provider.calls[0].jsonSchema).toBeDefined();
  });
});

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
