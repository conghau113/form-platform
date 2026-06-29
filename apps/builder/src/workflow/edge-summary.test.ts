import type { Guard } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { shortGuard, summarizeGuard } from "./edge-summary";

const g = (rule: Record<string, unknown>): Guard => ({ rule });

describe("summarizeGuard", () => {
  it("renders an equality on a var", () => {
    expect(summarizeGuard(g({ "==": [{ var: "backgroundCheckPassed" }, true] }))).toBe(
      "backgroundCheckPassed = true",
    );
  });

  it("renders numeric comparison with a math symbol", () => {
    expect(summarizeGuard(g({ ">=": [{ var: "overallRating" }, 3] }))).toBe("overallRating ≥ 3");
  });

  it("quotes string literals", () => {
    expect(summarizeGuard(g({ "==": [{ var: "dept" }, "IT"] }))).toBe('dept = "IT"');
  });

  it("joins an `and` of conditions", () => {
    expect(
      summarizeGuard(g({ and: [{ "==": [{ var: "a" }, true] }, { ">": [{ var: "b" }, 1] }] })),
    ).toBe("a = true và b > 1");
  });

  it("joins an `or` of conditions", () => {
    expect(summarizeGuard(g({ or: [{ var: "a" }, { var: "b" }] }))).toBe("a hoặc b");
  });

  it("renders negation", () => {
    expect(summarizeGuard(g({ "!": [{ var: "approved" }] }))).toBe("không approved");
  });

  it("renders membership", () => {
    expect(summarizeGuard(g({ in: [{ var: "role" }, ["hr", "it"]] }))).toBe('role ∈ "hr", "it"');
  });

  it("supports a var given as a bare string path", () => {
    expect(summarizeGuard(g({ "!!": { var: "flag" } }))).toBe("flag");
  });

  it("falls back to compact JSON for unknown operators", () => {
    expect(summarizeGuard(g({ weird: [1, 2, 3] }))).toBe('{"weird":[1,2,3]}');
  });
});

describe("shortGuard", () => {
  it("returns the full summary when short enough", () => {
    expect(shortGuard(g({ ">=": [{ var: "overallRating" }, 3] }))).toBe("overallRating ≥ 3");
  });

  it("truncates long summaries with an ellipsis", () => {
    const out = shortGuard(
      g({ "==": [{ var: "aVeryLongFieldNameThatExceedsTheLimit" }, true] }),
      16,
    );
    expect(out).toHaveLength(16);
    expect(out.endsWith("…")).toBe(true);
  });
});
