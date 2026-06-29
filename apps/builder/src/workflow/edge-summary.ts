import type { Guard } from "@org/workflow-schema";

/**
 * PURE: render a transition's JSONLogic {@link Guard} as a short, human-readable condition so a
 * reviewer can read the branch logic straight off the canvas (#2 — role/guard first-class) instead
 * of having to click the edge open. This is presentation only — the engine still evaluates the raw
 * rule (never this string). Unknown / deeply-nested operators fall back to compact JSON so the chip
 * always shows *something* truthful rather than guessing.
 */

/** Comparison operators rendered with a math symbol; `var` and the logical ops are handled apart. */
const COMPARISON: Record<string, string> = {
  "==": "=",
  "===": "=",
  "!=": "≠",
  "!==": "≠",
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
};

/** A single operand: a `var` reference, a literal, or a nested sub-expression. */
function term(node: unknown): string {
  if (node === null) return "null";
  if (typeof node === "string") return JSON.stringify(node);
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return node.map(term).join(", ");
  if (typeof node === "object") return summarizeRule(node as Record<string, unknown>);
  return String(node);
}

/** Recursively summarize one JSONLogic node (an operator object) into a short condition. */
function summarizeRule(rule: Record<string, unknown>): string {
  const keys = Object.keys(rule);
  if (keys.length !== 1) return compact(rule);
  const op = keys[0];
  const arg = rule[op];

  if (op === "var") {
    if (typeof arg === "string") return arg;
    if (Array.isArray(arg) && arg.length > 0) return String(arg[0]);
    return String(arg);
  }

  if (op in COMPARISON && Array.isArray(arg) && arg.length === 2) {
    return `${term(arg[0])} ${COMPARISON[op]} ${term(arg[1])}`;
  }

  if ((op === "and" || op === "or") && Array.isArray(arg)) {
    const joiner = op === "and" ? " và " : " hoặc ";
    return arg.map(term).join(joiner);
  }

  if ((op === "!" || op === "!!") && arg !== undefined) {
    const inner = term(Array.isArray(arg) ? arg[0] : arg);
    return op === "!" ? `không ${inner}` : inner;
  }

  if (op === "in" && Array.isArray(arg) && arg.length === 2) {
    return `${term(arg[0])} ∈ ${term(arg[1])}`;
  }

  return compact(rule);
}

/** Last-resort rendering: compact JSON with no spaces after separators. */
function compact(value: unknown): string {
  return JSON.stringify(value).replace(/","/g, '", "');
}

/** The full, human-readable summary of a guard's rule (no truncation). */
export function summarizeGuard(guard: Guard): string {
  return summarizeRule(guard.rule);
}

/** A canvas-sized summary: {@link summarizeGuard} truncated to `max` chars with an ellipsis. */
export function shortGuard(guard: Guard, max = 32): string {
  const full = summarizeGuard(guard);
  return full.length > max ? `${full.slice(0, max - 1).trimEnd()}…` : full;
}
