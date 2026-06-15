import type { LeafField } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { numberFormatProps } from "./number-format.js";

type NumberField = Extract<LeafField, { type: "number" }>;
const num = (extra: Partial<NumberField>): NumberField =>
  ({ type: "number", name: "n", label: "N", ...extra }) as NumberField;

describe("numberFormatProps", () => {
  it("returns no formatter/parser without a displayFormat", () => {
    expect(numberFormatProps(num({}))).toEqual({});
  });

  it("groups thousands and strips back to the raw number", () => {
    const { formatter, parser } = numberFormatProps(num({ displayFormat: "thousands" }));
    expect(formatter?.(1234567)).toBe("1,234,567");
    expect(formatter?.(1234.5)).toBe("1,234.5");
    expect(formatter?.(undefined)).toBe("");
    // The parser strips formatting to a clean numeric string; antd's InputNumber coerces
    // it to a number (same `as unknown as number` pattern antd's own demos use).
    expect(parser?.("1,234,567") as unknown).toBe("1234567");
  });

  it("prefixes a currency symbol resolved from the code", () => {
    const usd = numberFormatProps(num({ displayFormat: "currency", currency: "USD" }));
    expect(usd.formatter?.(1000)).toBe("$ 1,000");
    const vnd = numberFormatProps(num({ displayFormat: "currency", currency: "vnd" }));
    expect(vnd.formatter?.(2500)).toBe("₫ 2,500");
    // Unknown code falls back to the code itself.
    expect(
      numberFormatProps(num({ displayFormat: "currency", currency: "XYZ" })).formatter?.(1),
    ).toBe("XYZ 1");
    expect(usd.parser?.("$ 1,000") as unknown).toBe("1000");
  });

  it("suffixes a percent sign", () => {
    const { formatter, parser } = numberFormatProps(num({ displayFormat: "percent" }));
    expect(formatter?.(50)).toBe("50%");
    expect(parser?.("50%") as unknown).toBe("50");
  });
});
