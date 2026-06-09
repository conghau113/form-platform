import type { FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { isVisible } from "./conditions.js";

const field = (extra: Record<string, unknown> = {}): FieldNode =>
  ({ type: "text", name: "otherCountry", label: "Specify country", ...extra }) as FieldNode;

describe("isVisible", () => {
  it("is visible when there is no visibleWhen rule", () => {
    expect(isVisible(field(), {})).toBe(true);
  });

  it("evaluates a JSONLogic rule against the values (true branch)", () => {
    const node = field({ visibleWhen: { rule: { "==": [{ var: "country" }, "OTHER"] } } });
    expect(isVisible(node, { country: "OTHER" })).toBe(true);
  });

  it("evaluates a JSONLogic rule against the values (false branch)", () => {
    const node = field({ visibleWhen: { rule: { "==": [{ var: "country" }, "OTHER"] } } });
    expect(isVisible(node, { country: "VN" })).toBe(false);
  });
});
