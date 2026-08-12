import { evalRule } from "@org/form-core";
import { EVN_PCT_REQUIRED_CONTENT, type EvnRequiredContentPair } from "./evn-required-fields.js";

/**
 * Evaluating EVN's `CONTENT_FINISHED` guard against the `ticketData` on the request (P4c).
 *
 * P4b could only NAME this guard. Here we run it: `checkContentFinished`
 * (`ticket.service.ts:5418`) walks `ACTION_FINISH_CONTENT` and, for every `item × mark` pair the
 * action lists, requires the `mark` property to be truthy on EVERY row of that item
 * (`ticket.service.ts:5478-5486`). Nothing else in the branch PCT takes.
 *
 * Pure and DI-free, like the rest of this surface.
 *
 * ⚠️ THE ASYMMETRY THAT SHAPES THIS FILE. EVN reads the item rows from `ticket_items` in their own
 * database; we read them from a request field the caller filled in. So "absent" means different
 * things on the two sides — for them "this ticket has no such item", for us "the caller did not
 * tell us". We never turn the second into the first. Anything we could not evaluate is named in
 * `unverifiedFields` and leaves `CONTENT_FINISHED` in `outOfScopeGuards`, so the reply says "you
 * still have to check this" rather than falling silently open.
 *
 * ⚠️ AN ITEM WITH NO ROWS PASSES. `_.forEach` over `undefined`, `null` or `[]` runs zero times
 * (measured against the lodash in EVN's own repo, not inferred), and JSONLogic `none` agrees. That
 * is their fail-open and we reproduce it deliberately — do not "fix" it. Tightening here would make
 * C refuse tickets EVN accepts, and a false refusal blocks real work.
 */

/**
 * A pair on the wire.
 *
 * ⚠️ `type` is deliberately NOT here, though the table carries it. It answers "which branch of EVN's
 * checker does this take", which is our implementation detail — the caller needs to know WHICH mark
 * to fill in, not how we decided. It stays on {@link UnverifiedContentPair}, where
 * `PAIR_NOT_MODELLED` is unreadable without it.
 */
export interface RequiredContentPair {
  itemCode: string;
  mark: string;
}

/** A pair we could not evaluate, and the reason, so `unverifiedFields` is never a bare shrug. */
export interface UnverifiedContentPair extends EvnRequiredContentPair {
  reason: UnverifiedReason;
}

/** Drop the columns that exist for our own gates rather than for the caller. */
function onWire(pair: EvnRequiredContentPair): RequiredContentPair {
  return { itemCode: pair.itemCode, mark: pair.mark };
}

export type UnverifiedReason =
  /** The request carried no `ticketData` at all. */
  | "TICKET_DATA_ABSENT"
  /** `ticketData` was sent, but has no entry for this item (or it is `null`). */
  | "ITEM_ABSENT"
  /** We hold a pair whose shape our primitive does not model — see {@link isModelled}. */
  | "PAIR_NOT_MODELLED"
  /** A row spells the mark in a way EVN and JSONLogic disagree about — see {@link disagrees}. */
  | "TRUTHINESS_DISAGREEMENT";

/** An item whose value is present but shaped so that neither we nor EVN read it the same way. */
export interface UnusableContentKey {
  itemCode: string;
  /** English, and free of anything the caller sent — it names the shape, never the value. */
  reason: string;
}

export type ContentOutcome =
  /**
   * At least one item is present but unreadable. The request, not the ticket, is what is wrong, so
   * this becomes a 422 rather than `allowed: false` — telling a caller their ticket is incomplete
   * when their payload is malformed sends them to fix the wrong thing.
   */
  | { kind: "unusable"; keys: readonly UnusableContentKey[] }
  | {
      kind: "evaluated";
      /** Pairs evaluated and found wanting. Empty means "evaluated, nothing missing". */
      requiredFields: readonly RequiredContentPair[];
      /** Pairs we did NOT evaluate. Empty is what lets `CONTENT_FINISHED` be dropped. */
      unverifiedFields: readonly UnverifiedContentPair[];
    };

/**
 * The only branch of `checkContentFinished` the `none` primitive models: `type: OBJ` with a mark,
 * checked one level deep.
 *
 * ⚠️ `PROCEDURE_OPERATIONAL_TASKS` is excluded by NAME, not by `type`. It is `OBJ` with a mark like
 * the rest, but EVN special-cases the code itself and checks `value[].children[][mark]` — two levels
 * (`ticket.service.ts:5462-5470`). The flat rule would silently inspect the wrong level. It appears
 * in `ACTION_FINISH_CONTENT` only inside commented-out PTT blocks today, and the generator plus a
 * committed-data test both refuse it; this is the third line of defence, and the only one that
 * holds if the table is ever edited by hand.
 */
function isModelled(pair: EvnRequiredContentPair): boolean {
  return pair.type === "OBJ" && pair.mark !== "" && pair.itemCode !== "PROCEDURE_OPERATIONAL_TASKS";
}

/**
 * Rows for one item, accepting BOTH shapes the caller might send.
 *
 * EVN assigns `itemTickets[code] = value.data` (`ticket.service.ts:5437`, `:5452`), so the rows are
 * the `.data` array — but a caller may reasonably send either the unwrapped array or the
 * `ticket_items.value` object it came out of. We detect by shape rather than making them declare
 * which they used.
 *
 * ⚠️ The flat scalar shape in EVN's own §12.C example (`"POWER_RUN_OUT_DEVICE": "Trạm 110kV"`) is
 * NOT accepted, and cannot be: `_.forEach` over a string iterates its CHARACTERS, so
 * `valueItem[mark]` is undefined and their own guard fails it. There is no reading of that shape
 * that matches their behaviour, so it is a 422 with an explanation rather than a guess.
 */
function rowsOf(value: unknown): readonly unknown[] | "unusable" {
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && value !== null && Object.hasOwn(value, "data")) {
    const data = (value as { data: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return "unusable";
}

/**
 * Whether a row's mark value is one the two truthiness rules read differently.
 *
 * Measured, for an EMPTY ARRAY only: JavaScript calls `[]` TRUTHY, so EVN's `!valueItem[mark]` is
 * false and the row PASSES. JSONLogic calls `[]` FALSY (`json-logic-js/logic.js:189-194`), so
 * `{"!": …}` is true, `none` returns false and the row FAILS. It is the only value the two
 * disagree about (`{}` is truthy to both), and it disagrees in the dangerous direction: we would
 * answer `allowed: false` for a ticket EVN allows.
 *
 * We do not special-case it into a verdict — that would mean two ways of evaluating one guard,
 * which is the disease this whole integration exists to avoid. Instead these rows are WITHHELD from
 * the rule and the remaining ones are judged normally; see {@link evaluateRequiredContent}.
 */
function disagrees(row: unknown, mark: string): boolean {
  if (typeof row !== "object" || row === null) return false;
  const value = (row as Record<string, unknown>)[mark];
  return Array.isArray(value) && value.length === 0;
}

/**
 * The P1 primitive from the design dossier: "no row of `<itemCode>` has a falsy `<mark>`".
 *
 * Built here and evaluated through `@org/form-core` rather than with a hand-rolled `.some()`,
 * because this is the exact rule text that will go into a workflow guard when a PCT form is
 * authored on the platform. One rule, one evaluator — two implementations of the same condition is
 * precisely the failure mode we are helping EVN out of.
 */
export function contentRule(pair: EvnRequiredContentPair): Record<string, unknown> {
  return { none: [{ var: pair.itemCode }, { "!": [{ var: pair.mark }] }] };
}

/** The pairs one action requires, in declaration order; `[]` for an action with no content guard. */
export function requiredContentFor(actionCode: string): readonly EvnRequiredContentPair[] {
  // Own-property check for the reason `check-transition.ts` gives: `@IsString()` admits "toString",
  // which would otherwise resolve up the prototype chain to a Function.
  return Object.hasOwn(EVN_PCT_REQUIRED_CONTENT, actionCode)
    ? (EVN_PCT_REQUIRED_CONTENT[actionCode] ?? [])
    : [];
}

/**
 * Run the content guard for one action against one request's `ticketData`.
 *
 * Returns rather than throws, so the whole decision path stays pure and testable without HTTP; the
 * service turns `unusable` into a 422.
 */
export function evaluateRequiredContent(
  actionCode: string,
  ticketData: Record<string, unknown> | null | undefined,
): ContentOutcome {
  const pairs = requiredContentFor(actionCode);
  const requiredFields: RequiredContentPair[] = [];
  const unverifiedFields: UnverifiedContentPair[] = [];
  const unusable: UnusableContentKey[] = [];

  for (const pair of pairs) {
    // Checked at runtime and not merely asserted in the generator: regenerating needs EVN's source,
    // so a generator-only gate never runs in CI. A `LIST` pair evaluated with this primitive would
    // pass an empty list that EVN rejects (`ticket.service.ts:5472-5477`) — silently.
    if (!isModelled(pair)) {
      unverifiedFields.push({ ...pair, reason: "PAIR_NOT_MODELLED" });
      continue;
    }
    if (ticketData === null || ticketData === undefined) {
      // `null` is reachable: `@IsOptional()` skips validation for it as well as for `undefined`.
      unverifiedFields.push({ ...pair, reason: "TICKET_DATA_ABSENT" });
      continue;
    }
    const raw = Object.hasOwn(ticketData, pair.itemCode) ? ticketData[pair.itemCode] : undefined;
    if (raw === undefined || raw === null) {
      // NOT a 422. A PCT ticket that never filled in item 2.5 is a valid ticket, and EVN passes it
      // (no row -> zero iterations). Refusing here would turn their fail-open into our hard error
      // on an endpoint called every time a user considers an action.
      unverifiedFields.push({ ...pair, reason: "ITEM_ABSENT" });
      continue;
    }
    const rows = rowsOf(raw);
    if (rows === "unusable") {
      unusable.push({
        itemCode: pair.itemCode,
        reason: "expected an array of rows, or an object with a `data` array",
      });
      continue;
    }
    // Judge only the rows the two truthiness rules agree about, then let the withheld ones decide
    // whether the PASS is trustworthy.
    //
    // ⚠️ Order matters and the obvious order is wrong. Bailing out as soon as ANY row disagrees —
    // which is what the first draft did — throws away the verdict on every other row: with
    // `[{MARK: []}, {MARK: false}]` the second row fails under BOTH rules, EVN definitively refuses,
    // and we would have answered `allowed: true`. A disagreement may only ever cost us a PASS we
    // are unsure of, never a refusal we are sure of.
    const decisive = rows.filter((row) => !disagrees(row, pair.mark));
    if (!evalRule(contentRule(pair), { [pair.itemCode]: decisive })) {
      requiredFields.push(onWire(pair));
    } else if (decisive.length !== rows.length) {
      // Everything we could judge passed, so the answer now rests entirely on rows we cannot judge.
      unverifiedFields.push({ ...pair, reason: "TRUTHINESS_DISAGREEMENT" });
    }
  }

  // One malformed item poisons the whole answer rather than being reported alongside a verdict: if
  // the caller got one item's shape wrong they most likely got them all wrong, and a partial
  // verdict rendered from a payload we cannot read is worth less than the question it raises.
  if (unusable.length > 0) return { kind: "unusable", keys: unusable };

  return { kind: "evaluated", requiredFields, unverifiedFields };
}
