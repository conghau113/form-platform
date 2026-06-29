import { describe, expect, it } from "vitest";
import { deriveCaseLabel } from "./case-label";

describe("deriveCaseLabel", () => {
  it("prefers an explicit fullName", () => {
    expect(deriveCaseLabel({ fullName: "Nguyễn Văn A", note: "x" })).toBe("Nguyễn Văn A");
  });

  it("matches a Vietnamese 'hoTen' field", () => {
    expect(deriveCaseLabel({ hoTen: "Trần Thị B" })).toBe("Trần Thị B");
  });

  it("prefers a specific name field over a generic title", () => {
    expect(deriveCaseLabel({ title: "Hợp đồng", fullName: "Lê C" })).toBe("Lê C");
  });

  it("matches a key merely containing 'name'", () => {
    expect(deriveCaseLabel({ employeeName: "Phạm D" })).toBe("Phạm D");
  });

  it("falls back to the first non-empty string value", () => {
    expect(deriveCaseLabel({ active: true, dept: "IT" })).toBe("IT");
  });

  it("skips empty / whitespace strings", () => {
    expect(deriveCaseLabel({ name: "   ", note: "real" })).toBe("real");
  });

  it("trims the chosen value", () => {
    expect(deriveCaseLabel({ name: "  Spaced  " })).toBe("Spaced");
  });

  it("caps very long labels", () => {
    const long = "x".repeat(200);
    const out = deriveCaseLabel({ name: long });
    expect(out).toHaveLength(80);
    expect(out?.endsWith("…")).toBe(true);
  });

  it("returns undefined when no usable string exists", () => {
    expect(deriveCaseLabel({ active: true, count: 3 })).toBeUndefined();
    expect(deriveCaseLabel({})).toBeUndefined();
    expect(deriveCaseLabel(undefined)).toBeUndefined();
  });
});
