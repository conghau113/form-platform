import { describe, expect, it } from "vitest";
import { translatableAttrs } from "./translatable";

describe("translatableAttrs", () => {
  it("returns a leaf's present string attributes in order, skipping absent/empty ones", () => {
    const attrs = translatableAttrs({
      type: "text",
      name: "email",
      label: "Email",
      placeholder: "you@example.com",
      helpText: "",
      tooltip: undefined,
    });
    expect(attrs.map((a) => a.attr)).toEqual(["label", "placeholder"]);
    expect(attrs[0]).toEqual({ attr: "label", label: "Label", value: "Email" });
  });

  it("covers container text (label/title/description)", () => {
    const attrs = translatableAttrs({ type: "card", title: "Details", description: "More" });
    expect(attrs.map((a) => a.attr)).toEqual(["title", "description"]);
  });

  it("covers display-text content", () => {
    const attrs = translatableAttrs({ type: "display-text", content: "Note" });
    expect(attrs.map((a) => a.attr)).toEqual(["content"]);
  });

  it("returns nothing when the node carries no translatable string", () => {
    expect(translatableAttrs({ type: "divider" })).toEqual([]);
  });
});
