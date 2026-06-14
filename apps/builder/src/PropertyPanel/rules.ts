import type { AuthoredField } from "./types";

/** Read the `{ field, value }` of a simple `{ "==": [{var}, value] }` JSONLogic rule,
 *  if it has that exact shape. Anything more complex returns null so the UI can fall
 *  back to a "edit via JSON" hint. Shared by the Visibility editor and ReactionsEditor. */
export function readEqualsRule(rule: unknown): { field: string; value: string } | null {
  const eq = (rule as { "=="?: unknown } | undefined)?.["=="];
  if (!Array.isArray(eq) || eq.length !== 2) return null;
  const left = eq[0] as { var?: string } | undefined;
  if (!left || typeof left.var !== "string") return null;
  return { field: left.var, value: String(eq[1] ?? "") };
}

/** Read the simple-equals shape of a field's `visibleWhen`, if any. */
export function readEquals(field: AuthoredField): { field: string; value: string } | null {
  return readEqualsRule(field.visibleWhen?.rule);
}

/** Comparators the simple cross-rule builder offers (json-logic operators). */
export const CROSS_OPS = ["==", "!=", ">", ">=", "<", "<="] as const;
export type CrossOp = (typeof CROSS_OPS)[number];
export type CrossRight = { kind: "field"; name: string } | { kind: "value"; value: string };

/** Read a simple `{op: [{var: left}, {var: right} | literal]}` JSONLogic rule, the
 *  shape the cross-rule builder writes. Anything more complex returns null so the UI
 *  falls back to a "edit via JSON" hint (same contract as readEqualsRule). */
export function readSimpleRule(
  rule: unknown,
): { op: CrossOp; left: string; right: CrossRight } | null {
  if (rule == null || typeof rule !== "object") return null;
  const keys = Object.keys(rule);
  if (keys.length !== 1) return null;
  const op = keys[0] as CrossOp;
  if (!CROSS_OPS.includes(op)) return null;
  const args = (rule as Record<string, unknown>)[op];
  if (!Array.isArray(args) || args.length !== 2) return null;
  const left = args[0] as { var?: unknown } | null;
  if (left == null || typeof left !== "object" || typeof left.var !== "string") return null;
  const rightRaw = args[1];
  if (rightRaw != null && typeof rightRaw === "object") {
    const rv = (rightRaw as { var?: unknown }).var;
    if (typeof rv !== "string") return null;
    return { op, left: left.var, right: { kind: "field", name: rv } };
  }
  return { op, left: left.var, right: { kind: "value", value: String(rightRaw ?? "") } };
}

/** Store numeric-looking literals as numbers so json-logic's ordering operators
 *  compare numerically. */
export function coerceLiteral(text: string): string | number {
  return text !== "" && !Number.isNaN(Number(text)) ? Number(text) : text;
}
