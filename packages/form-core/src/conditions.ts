import type { FieldNode } from "@org/form-schema";
import jsonLogic from "json-logic-js";

/**
 * SAFE conditional evaluation. The rule is plain JSON data interpreted by
 * json-logic-js. We never use eval() / new Function() on schema-provided rules.
 * Shared by EVERY renderer (web + native) so logic behaves identically.
 */
export function isVisible(node: FieldNode, values: Record<string, unknown>): boolean {
  const cond = (node as any).visibleWhen;
  if (!cond?.rule) return true;
  return evalRule(cond.rule, values);
}

/** Evaluate a raw JSONLogic rule against `values`, coerced to boolean. The single
 *  choke point for SAFE rule evaluation — `isVisible` and the reactions engine both
 *  delegate here so visibility and linkage interpret rules identically. NEVER eval(). */
export function evalRule(rule: Record<string, unknown>, values: Record<string, unknown>): boolean {
  return Boolean(jsonLogic.apply(rule, values));
}
