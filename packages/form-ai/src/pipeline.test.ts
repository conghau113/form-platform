import type { AiCompletionRequest, AiMessage, AiProvider } from "@org/ai-core";
import { describe, expect, it } from "vitest";
import { generateForm, refineForm } from "./pipeline.js";

/** Concatenate every text part of a message for substring assertions. */
function messageText(messages: AiMessage[], role: AiMessage["role"]): string {
  return messages
    .filter((m) => m.role === role)
    .flatMap((m) => m.content)
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n");
}

const tinyImage = { base64: "AAAA", mediaType: "image/png" };

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

  it("includes the vision instructions in the system prompt when images are attached", async () => {
    const provider = scriptedProvider([validForm]);
    await generateForm(provider, { prompt: "make this", images: [tinyImage] });
    expect(messageText(provider.calls[0].messages, "system")).toContain("REFERENCE IMAGE");
  });

  it("two-pass transcribes first (no json_schema) then builds from the spec", async () => {
    const spec = "1. Email — text — required";
    const provider = scriptedProvider([spec, validForm]);
    const result = await generateForm(
      provider,
      { prompt: "from the screenshot", images: [tinyImage] },
      { imageStrategy: "two-pass" },
    );

    expect(result.ok).toBe(true);
    expect(provider.calls).toHaveLength(2);
    // Pass 1 is a free-text transcription — never constrained to the form schema.
    expect(provider.calls[0].jsonSchema).toBeUndefined();
    // Pass 2 is the normal build (schema applied) and carries the spec as guidance.
    expect(provider.calls[1].jsonSchema).toBeDefined();
    expect(messageText(provider.calls[1].messages, "system")).toContain(spec);
  });

  it("single-pass (the default) never makes a transcription call", async () => {
    const provider = scriptedProvider([validForm]);
    await generateForm(provider, { prompt: "x", images: [tinyImage] });
    expect(provider.calls).toHaveLength(1);
  });
});

describe("refineForm", () => {
  it("carries the current form and the instruction into the request", async () => {
    const provider = scriptedProvider([validForm]);
    const current = { id: "c", title: "C", fields: [{ type: "text", name: "email", label: "E" }] };
    const result = await refineForm(provider, {
      currentForm: current,
      instruction: "make email required",
    });

    expect(result.ok).toBe(true);
    const userText = messageText(provider.calls[0].messages, "user");
    expect(userText).toContain("make email required");
    expect(userText).toContain('"email"');
    // The system prompt switches into edit mode (preserve names, apply only the change).
    expect(messageText(provider.calls[0].messages, "system")).toContain("EDITING");
  });

  it("re-validates and repairs a bad edit just like generate", async () => {
    const invalid = JSON.stringify({ id: "x" }); // missing title + fields
    const provider = scriptedProvider([invalid, validForm]);
    const result = await refineForm(provider, { currentForm: {}, instruction: "x" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
  });
});
