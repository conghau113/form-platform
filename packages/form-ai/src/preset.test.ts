import type { AiCompletionRequest, AiMessage, AiProvider } from "@org/ai-core";
import { describe, expect, it } from "vitest";
import { generatePreset, normalizePresetDraft } from "./preset.js";
import { stripPresetUrls } from "./sanitize.js";

/** Concatenate every text part of a message for substring assertions. */
function messageText(messages: AiMessage[], role: AiMessage["role"]): string {
  return messages
    .filter((m) => m.role === role)
    .flatMap((m) => m.content)
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("\n");
}

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

const validPreset = JSON.stringify({
  name: "Vietnam phone number",
  fieldType: "text",
  icon: "antd:PhoneOutlined",
  patch: {
    label: "Số điện thoại",
    placeholder: "09xx xxx xxx",
    required: true,
    validations: [{ type: "pattern", value: "^0\\d{9}$", message: "Số điện thoại không hợp lệ" }],
  },
});

describe("normalizePresetDraft", () => {
  it("accepts a coherent draft and returns a contract-clean patch", () => {
    const result = normalizePresetDraft(JSON.parse(validPreset));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Vietnam phone number");
    expect(result.value.fieldType).toBe("text");
    expect(result.value.icon).toBe("antd:PhoneOutlined");
    expect(result.value.patch.label).toBe("Số điện thoại");
    expect(result.value.patch.required).toBe(true);
  });

  it("drops instance-identity / link keys from the patch", () => {
    const result = normalizePresetDraft({
      name: "Email",
      fieldType: "text",
      patch: { label: "Email", name: "should_be_dropped", presetId: "x", overrides: {} },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.patch).not.toHaveProperty("name");
    expect(result.value.patch).not.toHaveProperty("presetId");
    expect(result.value.patch).not.toHaveProperty("overrides");
  });

  it("strips unknown keys the contract does not define", () => {
    const result = normalizePresetDraft({
      name: "X",
      fieldType: "text",
      patch: { label: "X", bogusProp: 123 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.patch).not.toHaveProperty("bogusProp");
  });

  it("rejects an unknown field type", () => {
    const result = normalizePresetDraft({
      name: "X",
      fieldType: "telephone",
      patch: { label: "X" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("fieldType");
  });

  it("rejects a container field type (presets are leaf-only)", () => {
    const result = normalizePresetDraft({ name: "X", fieldType: "group", patch: { label: "X" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("container");
  });

  it("rejects a patch that fails the field contract (wrong prop type)", () => {
    const result = normalizePresetDraft({
      name: "X",
      fieldType: "number",
      patch: { label: "X", min: "not-a-number" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("requires a non-empty name and an object patch", () => {
    expect(normalizePresetDraft({ fieldType: "text", patch: { label: "X" } }).ok).toBe(false);
    expect(normalizePresetDraft({ name: "X", fieldType: "text", patch: "nope" }).ok).toBe(false);
  });
});

describe("generatePreset", () => {
  it("returns a contract-valid preset on the first attempt", async () => {
    const provider = scriptedProvider([validPreset]);
    const result = await generatePreset(provider, { prompt: "a VN phone field" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(1);
    expect(result.preset.fieldType).toBe("text");
  });

  it("repairs an invalid draft using a follow-up round", async () => {
    const invalid = JSON.stringify({ name: "X", fieldType: "text", patch: {} }); // no label
    const provider = scriptedProvider([invalid, validPreset]);
    const result = await generatePreset(provider, { prompt: "x" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(provider.calls[1].messages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("embeds the fieldType constraint in the system prompt", async () => {
    const provider = scriptedProvider([validPreset]);
    await generatePreset(provider, { prompt: "x", fieldType: "select" });
    expect(messageText(provider.calls[0].messages, "system")).toContain('fieldType "select"');
  });

  it("gives up after maxRepairs with structured errors", async () => {
    const provider = scriptedProvider(["not json"]);
    const result = await generatePreset(provider, { prompt: "x" }, { maxRepairs: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.attempts).toBe(2);
  });
});

describe("stripPresetUrls", () => {
  it("removes an off-allowlist dataSource url from the patch", () => {
    const draft = {
      name: "Country",
      fieldType: "select" as const,
      patch: { label: "Country", dataSource: { url: "https://evil.test/options" } },
    };
    const { preset, stripped } = stripPresetUrls(draft, ["api.myco.com"]);
    expect(stripped).toEqual(["https://evil.test/options"]);
    expect(preset.patch.dataSource).toBeUndefined();
  });

  it("keeps an allowlisted dataSource url", () => {
    const draft = {
      name: "Country",
      fieldType: "select" as const,
      patch: { label: "Country", dataSource: { url: "https://api.myco.com/options" } },
    };
    const { preset, stripped } = stripPresetUrls(draft, ["api.myco.com"]);
    expect(stripped).toEqual([]);
    expect(preset.patch.dataSource).toEqual({ url: "https://api.myco.com/options" });
  });
});
