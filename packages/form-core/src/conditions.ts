import jsonLogic from "json-logic-js";
import type { FieldNode } from "@org/form-schema";

/**
 * SAFE conditional evaluation. The rule is plain JSON data interpreted by
 * json-logic-js. We never use eval() / new Function() on schema-provided rules.
 * Shared by EVERY renderer (web + native) so logic behaves identically.
 */
export function isVisible(node: FieldNode, values: Record<string, unknown>): boolean {
  const cond = (node as any).visibleWhen;
  if (!cond?.rule) return true;
  return Boolean(jsonLogic.apply(cond.rule, values));
}
