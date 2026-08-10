import { EVN_ITEM_CODES } from "./evn-item-codes.js";

/**
 * Codes we generate ourselves for containers the author never named (`evn-template.ts` `codeOf`).
 *
 * They are outside EVN's vocabulary BY DESIGN, so counting them as unknown would report our own
 * decision back to the author as their mistake.
 *
 * ⚠️ Known hole, deliberately not plugged: `codeOf` returns an authored `name` verbatim, so a field
 * the author literally named `GEN_FOO` is exempted too. Detecting that would mean tracking which
 * codes we generated through the whole walk, to catch a name nobody writes by accident.
 */
const GENERATED_CODE_PREFIX = "GEN_";

const KNOWN = new Set(EVN_ITEM_CODES);

/** Whether EVN's own vocabulary declares this item code. */
export function isKnownItemCode(code: string): boolean {
  return KNOWN.has(code);
}

/** Whether this code is one we generated rather than one the author chose. */
export function isGeneratedCode(code: string): boolean {
  return code.startsWith(GENERATED_CODE_PREFIX);
}
