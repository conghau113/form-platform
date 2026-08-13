import { createHash } from "node:crypto";
import { EVN_NO_STATUS_CHANGE_ACTIONS, EVN_PCT_GUARDS } from "./evn-guards.js";
import { EVN_PCT_REQUIRED_CONTENT } from "./evn-required-fields.js";
import { EVN_PCT_TIE_BREAKS, EVN_PCT_TRANSITIONS } from "./evn-transitions.js";

/**
 * Which snapshot of EVN's tables this build decides from (QĐ-6, P4d-1).
 *
 * Endpoint C mirrors data that lives in someone else's repository. When they change it and we
 * regenerate, every answer C gives can move without a single line of our own code changing. This
 * module gives that data a name a caller can pin, diff and complain about.
 *
 * ⚠️ **It covers the DATA, not the CODE, and that limit is published rather than hidden.** P4c fixed
 * a bug that changed C's verdicts without touching a byte of the tables — `[]` is truthy to JS and
 * falsy to JSONLogic, decided in `required-content.ts`. This version would not have moved for it.
 * The honest reading is "which snapshot of EVN's tables am I looking at", never "has this endpoint's
 * behaviour changed". The alternative — a hand-bumped contract revision — is the kind of gate that
 * rots the first time someone forgets, which this track has already learned once (P4a).
 *
 * ⚠️ The constant does not DETECT anything on its own; it only takes a different value. What catches
 * drift is `definition-version.test.ts` pinning it verbatim, and that test runs in CI — unlike the
 * assertions inside `src/scripts/measure-evn-*.ts`, which need EVN's source tree to run at all.
 *
 * ⚠️ Not to be confused with `definitionVersion` in `packages/workflow-schema/src/schema.ts` — that
 * one is an integer, counts revisions of OUR workflow definitions, and has nothing to do with EVN.
 */

/**
 * A stable string for any JSON-shaped value: object keys sorted, array order preserved.
 *
 * Sorting keys means a generator that emits the same table with its members in a different order
 * does not churn the version for callers who pinned it. Array order is deliberately NOT sorted —
 * row order in the transition table is data, not presentation, and `ambiguousNext` reports
 * candidates in it (`check-transition.test.ts` pins that order).
 *
 * ⚠️ An own key holding `undefined` hashes identically to an absent key. `EvnTransitionRow` uses an
 * optional `statusCodeNext` to mean "the table said nothing here", and a generator that started
 * emitting the key explicitly as `undefined` would otherwise change the version while the data
 * stayed the same. Note this rule is object-level only: inside an ARRAY, `undefined` and `null`
 * both serialise to `null`, exactly as `JSON.stringify` does — a hole in a table row is not a
 * distinction any of our generators can currently express.
 *
 * ⚠️ Numbers follow `JSON.stringify` semantics too: `NaN`, `Infinity` and `-Infinity` all become
 * `null`, and `-0` becomes `0`. No table carries a number today; this is documented so that the
 * day one does, nobody assumes otherwise.
 *
 * @throws if handed an exotic object (`Date`, `Set`, `Map`, a class instance). Those would all
 * flatten to `{}` and collide with each other — a table silently emitted as a `Set<string>` instead
 * of an array would move the version ONCE and then never move again, which is the worst possible
 * failure for a drift signal: it looks like it is working.
 * @returns a serialisation intended for hashing, not for display or for parsing back.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  // Not objects, so they slip past the branch below and would serialise to "null" — the same silent
  // collision the throw exists to prevent, one `typeof` away.
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    throw new TypeError(`canonicalize: refusing to hash a ${typeof value}.`);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(
        `canonicalize: refusing to hash a ${value.constructor?.name ?? "non-plain"} — ` +
          "every table must be a plain object or an array, or the version stops moving.",
      );
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, member]) => `${JSON.stringify(key)}:${canonicalize(member)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** SHA-256 of {@link canonicalize}, full hex. Exported so the properties above are testable on
 *  hand-built values rather than only through the one constant below. */
export function hashDefinition(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

/**
 * The five tables endpoint C reads to reach a verdict — and nothing else.
 *
 * The key names are part of the hash, so renaming, splitting or merging a table moves the version
 * too. The `EVN_GUARD_*` string constants are deliberately absent: they are names for values already
 * inside `guards`, so including them would add length without adding a single case they could catch.
 */
export const PCT_DEFINITION = {
  transitions: EVN_PCT_TRANSITIONS,
  tieBreaks: EVN_PCT_TIE_BREAKS,
  guards: EVN_PCT_GUARDS,
  noStatusChangeActions: EVN_NO_STATUS_CHANGE_ACTIONS,
  requiredContent: EVN_PCT_REQUIRED_CONTENT,
} as const;

/**
 * The version C reports, computed once at module load.
 *
 * The `pct-` prefix names the scope: this is the PCT table set THIS BUILD holds. It is constant
 * across every reply from a given build — including a `NO_TABLE` reply about some other ticket type,
 * where it still answers "which build are you talking to" rather than claiming to be that type's
 * definition version.
 *
 * 16 hex characters (64 bits) is drift detection, not a security boundary; nothing here defends
 * against a chosen-prefix attack because nothing here is adversarial.
 *
 * 💡 Both gates in `definition-version.test.ts` fire on a dropped `canonicalize`, not just the
 * key-order one: `EVN_PCT_REQUIRED_CONTENT`'s keys are not alphabetical in the generated file, so
 * losing the sort changes this value and the verbatim pin goes red as well.
 */
export const EVN_PCT_DEFINITION_VERSION = `pct-${hashDefinition(PCT_DEFINITION).slice(0, 16)}`;
