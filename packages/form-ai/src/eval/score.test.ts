import { describe, expect, it } from "vitest";
import { normalizeFormDraft } from "../normalize.js";
import type { GenerateFormResult } from "../pipeline.js";
import { type GoldenExpectation, scoreCase, summarizeEval } from "./score.js";

/** Wrap a draft into a success result the scorer can consume. */
function ok(draft: unknown): GenerateFormResult {
  const n = normalizeFormDraft(draft);
  if (!n.ok) throw new Error(`fixture draft invalid: ${n.errors.join("; ")}`);
  return { ok: true, form: n.value, attempts: 1, raw: "" };
}

const sample = {
  id: "s",
  title: "S",
  fields: [
    { type: "text", name: "email", label: "Email" },
    { type: "textarea", name: "message", label: "Message" },
  ],
};

describe("scoreCase", () => {
  it("passes when types, fields and count are all satisfied", () => {
    const expect_: GoldenExpectation = {
      minFields: 2,
      expectTypes: ["text", "textarea"],
      expectFields: ["email"],
    };
    const score = scoreCase("s", ok(sample), expect_);
    expect(score.parsed).toBe(true);
    expect(score.typeCoverage).toBe(1);
    expect(score.fieldCoverage).toBe(1);
    expect(score.fieldCountOk).toBe(true);
    expect(score.pass).toBe(true);
  });

  it("reports partial type coverage without passing", () => {
    const score = scoreCase("s", ok(sample), { expectTypes: ["text", "select"] });
    expect(score.typeCoverage).toBe(0.5);
    expect(score.pass).toBe(false);
  });

  it("matches expected fields against name OR label, case-insensitively", () => {
    const score = scoreCase("s", ok(sample), { expectFields: ["MESS"] });
    expect(score.fieldCoverage).toBe(1);
  });

  it("flags too-few fields", () => {
    const score = scoreCase("s", ok(sample), { minFields: 5 });
    expect(score.fieldCountOk).toBe(false);
    expect(score.pass).toBe(false);
  });

  it("counts nested array itemFields toward the field count and types", () => {
    const withArray = {
      id: "a",
      title: "A",
      fields: [
        { type: "text", name: "customer", label: "Customer" },
        {
          type: "array",
          name: "items",
          label: "Items",
          itemFields: [{ type: "number", name: "qty", label: "Qty" }],
        },
      ],
    };
    const score = scoreCase("a", ok(withArray), {
      minFields: 3,
      expectTypes: ["array", "number"],
    });
    expect(score.fieldCountOk).toBe(true);
    expect(score.typeCoverage).toBe(1);
  });

  it("scores a failed generation as unparsed with zero coverage", () => {
    const fail: GenerateFormResult = { ok: false, errors: ["nope"], attempts: 4 };
    const score = scoreCase("f", fail, { expectTypes: ["text"], minFields: 1 });
    expect(score.parsed).toBe(false);
    expect(score.typeCoverage).toBe(0);
    expect(score.fieldCountOk).toBe(false);
    expect(score.pass).toBe(false);
    expect(score.errors).toEqual(["nope"]);
  });
});

describe("summarizeEval", () => {
  it("aggregates parse-rate and pass-rate", () => {
    const scores = [
      scoreCase("a", ok(sample), { expectTypes: ["text"] }),
      scoreCase("b", ok(sample), { expectTypes: ["select"] }), // parses but weak
      scoreCase("c", { ok: false, errors: ["x"], attempts: 4 }, { expectTypes: ["text"] }),
    ];
    const summary = summarizeEval(scores);
    expect(summary.total).toBe(3);
    expect(summary.parsed).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.parseRate).toBeCloseTo(2 / 3);
    expect(summary.passRate).toBeCloseTo(1 / 3);
  });

  it("is empty-safe", () => {
    const summary = summarizeEval([]);
    expect(summary.parseRate).toBe(0);
    expect(summary.avgAttempts).toBe(0);
  });
});
