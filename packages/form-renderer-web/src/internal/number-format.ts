import type { LeafField } from "@org/form-schema";

type NumberField = Extract<LeafField, { type: "number" }>;

/** antd InputNumber formatter/parser pair. Both are fixed, schema-selected functions —
 *  the JSON only carries the `displayFormat` enum, never code (no eval). */
export interface NumberFormatProps {
  formatter?: (value: number | string | undefined) => string;
  parser?: (displayValue: string | undefined) => number;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  VND: "₫",
};

/** Group the integer part with thousands separators, preserving any decimal part. */
function group(value: number | string | undefined): string {
  if (value == null || value === "") return "";
  const [int, dec] = `${value}`.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec != null ? `${grouped}.${dec}` : grouped;
}

/** Strip every non-numeric character (keep digits, dot, minus). Cast to number the same
 *  way antd's own demos do — InputNumber coerces the cleaned string. */
const strip = (v: string | undefined): number =>
  (v ?? "").replace(/[^\d.-]/g, "") as unknown as number;

/** Map a number field's declarative `displayFormat` to antd formatter/parser props.
 *  Returns `{}` when no format is set (antd shows the raw value). */
export function numberFormatProps(node: NumberField): NumberFormatProps {
  switch (node.displayFormat) {
    case "thousands":
      return { formatter: group, parser: strip };
    case "currency": {
      const symbol =
        CURRENCY_SYMBOLS[(node.currency ?? "USD").toUpperCase()] ?? node.currency ?? "$";
      return {
        formatter: (value) => (value == null || value === "" ? "" : `${symbol} ${group(value)}`),
        parser: strip,
      };
    }
    case "percent":
      return {
        formatter: (value) => (value == null || value === "" ? "" : `${group(value)}%`),
        parser: strip,
      };
    default:
      return {};
  }
}
