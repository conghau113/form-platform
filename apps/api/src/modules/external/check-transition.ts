import {
  EVN_GUARD_CONTENT_FINISHED,
  EVN_NO_STATUS_CHANGE_ACTIONS,
  EVN_PCT_GUARDS,
} from "./evn-guards.js";
import {
  type ContentOutcome,
  evaluateRequiredContent,
  type RequiredContentPair,
  type UnverifiedContentPair,
} from "./required-content.js";
import { lookupTransition } from "./transition-table.js";

/**
 * Deciding one `POST /external/check-transition` (P4b, extended in P4c).
 *
 * Pure and DI-free, like `transition-table.ts` and for the same reason: everything the endpoint says
 * is decided here, and it should be testable against the real measured tables without HTTP.
 *
 * ⚠️ Deliberately imports no clock, no random and no id generator. Two identical requests must
 * produce byte-identical bodies — a caller may cache, diff or replay these — and "the module has
 * nothing non-deterministic in it" is a property worth keeping true by construction rather than by
 * a test that would pass regardless.
 *
 * ⚠️ What `allowed: true` means: "no guard WITHIN C'S SCOPE is violated" (QĐ-1). It is not
 * permission. `outOfScopeGuards` is the other half of that sentence and is never decoration — for
 * several actions it is the only honest content of the reply.
 */

/** The ticket type whose transition table we hold. */
export const EVN_PCT_TICKET_TYPE = "PCT";

/**
 * Coverage is reported separately from guards, because the two answer different questions.
 *
 * `outOfScopeGuards` says what EVN must still check. Coverage says how much of the question C could
 * even see — a property of OUR data, not of their process. Folding the second into the first (as the
 * first draft did) makes the guard list vary per request, which in turn makes "this list only ever
 * shrinks as we implement more" untestable.
 */
export type TransitionCoverage =
  /** We hold the table for this ticket type and found the row. */
  | "TABLE"
  /** We hold the table, and it has nothing for this status/action pair. */
  | "TABLE_INCOMPLETE"
  /** We hold no table for this ticket type at all. */
  | "NO_TABLE";

export interface CheckTransitionInput {
  ticketTypeCode: string;
  currentStatusCode: string;
  actionCode: string;
  executorUserCode: string;
  /**
   * Roles assigned on the ticket, with who holds each. Optional: EVN's §12.C request as specified
   * does not carry it (open question B1).
   *
   * ⚠️ Must be the UNFILTERED set. EVN's gate left-joins `ticket_role_values` with no `active`
   * predicate (`ticket.service.ts:8110`); only the "what can I do next" listing filters
   * (`ticket-action.service.ts:2587`). Handed the active subset we would answer `allowed: false` for
   * actions EVN lets through.
   */
  ticketRoles?: readonly { roleCode: string; userCode: string }[];
  /**
   * Ticket item values, keyed by item code. Optional, and `null` is reachable through the DTO.
   *
   * Absent is not the same as empty: absent means we evaluate nothing and say so, whereas an item
   * present with no rows is a real answer that PASSES. See `required-content.ts`.
   */
  ticketData?: Record<string, unknown> | null;
}

export interface CheckTransitionResult {
  allowed: boolean;
  /** `null` = this action does not move the ticket, or we could not tell. */
  nextStatus: string | null;
  /**
   * The next statuses the table offers when it cannot choose between them, in table order.
   *
   * Always present; `[]` means "no ambiguity", which is a claim we can make honestly — unlike a
   * bare `[]` for something never evaluated, which is why {@link unverifiedFields} exists.
   */
  ambiguousNext: readonly string[];
  coverage: TransitionCoverage;
  /**
   * Guards EVN must still evaluate itself. See {@link EVN_PCT_GUARDS}.
   *
   * ⚠️ ABSENT when `coverage` is `NO_TABLE`, by the same rule that drops `requiredFields` and
   * `unverifiedFields` there: for a ticket type we hold nothing about, `[]` would read as "we
   * looked, nothing outstanding" — the strongest possible claim, from the least knowledge.
   */
  outOfScopeGuards?: readonly string[];
  /**
   * Content requirements EVN's `checkContentFinished` would reject on, evaluated against
   * `ticketData` (P4c). `[]` means "evaluated, nothing missing" — an honest claim only because
   * anything we could not evaluate goes to {@link unverifiedFields} instead.
   *
   * ⚠️ Present exactly when `coverage` is not `NO_TABLE`, together with `unverifiedFields`. The
   * pair does not depend on whether the request carried `ticketData`: for an action with no content
   * guard at all, `[]` is knowable without any data, and a field that appears and disappears with
   * an unrelated input is a contract a caller cannot code against.
   */
  requiredFields?: readonly RequiredContentPair[];
  /**
   * Content requirements we did NOT evaluate, each with a reason.
   *
   * This is what keeps a missing `ticketData` from reading as a clean bill of health. While it is
   * non-empty, `CONTENT_FINISHED` stays in {@link outOfScopeGuards} — the caller is told, in both
   * places, that this guard is still theirs to run.
   */
  unverifiedFields?: readonly UnverifiedContentPair[];
  /** Human-readable and English. Two identical requests produce an identical string. */
  message: string;
}

/**
 * The outcome of one request: a verdict, or a refusal to render one from an unreadable payload.
 *
 * A union rather than an exception because {@link decideTransition} is pure — every branch of this
 * surface is decided in one testable place, and the HTTP layer is what turns `unusable` into a 422.
 * It is deliberately not a `CheckTransitionResult` with an error field: a caller must not be able to
 * read `allowed` off a reply we never computed.
 */
export type TransitionDecision =
  | { ok: true; result: CheckTransitionResult }
  | { ok: false; unusable: readonly { itemCode: string; reason: string }[] };

/**
 * The guards for one action, or `[]`.
 *
 * ⚠️ `EVN_PCT_GUARDS[actionCode]` alone is not safe here, and not theoretically: `actionCode` is
 * whatever the caller sent, and `@IsString()` happily admits `"toString"` or `"constructor"`, both
 * of which resolve up the prototype chain to a Function. `JSON.stringify` then DROPS the field
 * entirely and the caller receives a body missing a member the contract declares — while
 * `"__proto__"` yields `{}`. An own-property check is what makes the declared `readonly string[]`
 * true at runtime rather than merely at compile time.
 */
function guardsFor(actionCode: string): readonly string[] {
  return Object.hasOwn(EVN_PCT_GUARDS, actionCode) ? (EVN_PCT_GUARDS[actionCode] ?? []) : [];
}

/**
 * Apply EVN's second, table-independent way of saying "this action moves nothing".
 *
 * Split out and exported for one reason: it is the safety net for the table drifting, so it must be
 * testable against a next status the committed table does not currently produce. Tested only through
 * {@link decideTransition} it is untestable — every one of these actions already resolves to `null`,
 * so deleting the net entirely would leave every test green.
 *
 * @param tableNextStatus what the transition table resolved to, `null` meaning "no change".
 */
export function resolveNextStatus(
  actionCode: string,
  tableNextStatus: string | null,
): string | null {
  return EVN_NO_STATUS_CHANGE_ACTIONS.includes(actionCode) ? null : tableNextStatus;
}

/**
 * Drop `CONTENT_FINISHED` from the out-of-scope list, but ONLY once we evaluated all of it.
 *
 * ⚠️ Even then the claim is narrower than it looks, and the handover doc says so: we evaluated the
 * `ticketData` on the REQUEST, while EVN evaluates `ticket_items` in their database
 * (`ticket.service.ts:5437`, `:5452`). Nothing binds the two. A caller whose payload does not
 * mirror their own rows gets an answer about the payload.
 */
function scopedGuards(
  actionCode: string,
  content: Extract<ContentOutcome, { kind: "evaluated" }>,
): readonly string[] {
  const guards = guardsFor(actionCode);
  if (content.unverifiedFields.length > 0) return guards;
  return guards.filter((guard) => guard !== EVN_GUARD_CONTENT_FINISHED);
}

/**
 * ⚠️ `requiredFields` can make `allowed` false, which is the SECOND way this endpoint refuses and
 * the first that does not need `ticketRoles`. P4b's handover note said C could not refuse anything
 * until `ticketRoles` arrived; that sentence was rewritten for P4c rather than quietly outgrown.
 * The guard behind it genuinely throws (`ticket.service.ts:4796-4798`), so answering `allowed: true`
 * on a ticket EVN would reject would be the reply lying in the direction that costs the caller most.
 */
export function decideTransition(input: CheckTransitionInput): TransitionDecision {
  const { ticketTypeCode, currentStatusCode, actionCode, executorUserCode, ticketRoles } = input;

  if (ticketTypeCode !== EVN_PCT_TICKET_TYPE) {
    // Not a refusal. C is an advisory pre-check, so "I hold no table for this ticket type" must not
    // be spelled the same way as "EVN would reject this", and must not be an error either — a 404
    // here would make an unknown ticket type indistinguishable from a misrouted request.
    //
    // `outOfScopeGuards` is omitted rather than empty: our guard table is PCT's, and an empty list
    // for a type we never measured would claim there is nothing left to check. `requiredFields` and
    // `unverifiedFields` are omitted for the same reason — our content table is PCT's too.
    return {
      ok: true,
      result: {
        allowed: true,
        nextStatus: null,
        ambiguousNext: [],
        coverage: "NO_TABLE",
        message: `No transition table for ticket type "${ticketTypeCode}"; this reply decides nothing.`,
      },
    };
  }

  const content = evaluateRequiredContent(actionCode, input.ticketData);
  // Shape, not substance: an item we cannot read is a bad request, not an incomplete ticket. Sent
  // back as a 422 so the integrator fixes their payload instead of hunting for a field to tick.
  if (content.kind === "unusable") return { ok: false, unusable: content.keys };

  const outOfScopeGuards = scopedGuards(actionCode, content);
  const contentFields = {
    requiredFields: content.requiredFields,
    unverifiedFields: content.unverifiedFields,
  };
  const blocked = content.requiredFields.length > 0;
  const contentMessage = blocked
    ? `${content.requiredFields.length} content requirement(s) are not met; see \`requiredFields\`.`
    : "";
  /**
   * Prefix the branch's own sentence with the content verdict — the two say different things and
   * both are true: "you may not do this yet" AND "we cannot tell you where it would go".
   *
   * ⚠️ `advisory` is the branch text that CONTRADICTS a refusal. `TABLE_INCOMPLETE` normally means
   * "the reply is advisory only", which read next to `allowed: false` tells the caller to ignore the
   * refusal they were just given. When content blocks, that half is replaced rather than appended —
   * the content guard does not depend on the table, so the refusal is not advisory even though the
   * next status is unknown.
   */
  const say = (branch: string, advisory = false): string =>
    blocked && advisory
      ? `${contentMessage} The transition itself could not be looked up, so no next status is offered.`
      : [contentMessage, branch].filter(Boolean).join(" ");

  const lookup = lookupTransition({
    statusCode: currentStatusCode,
    actionCode,
    // Only the roles held by the PERSON ACTING, mirroring `isPermission` (`ticket.service.ts:8123`,
    // which matches rows on `trv.user_code == executor`). Passing every role on the ticket here
    // would make the role filter match something for almost any executor, so `roleMismatch` would
    // never fire and C would silently stop being able to refuse.
    executorRoleCodes: ticketRoles
      ? ticketRoles.filter((role) => role.userCode === executorUserCode).map((r) => r.roleCode)
      : undefined,
    // Whereas the tie-break asks whether ANYONE on the ticket holds a role
    // (`checkRoleCodeExistInTicket`, `ticket-action.service.ts:1669`).
    //
    // ⚠️ `undefined` when we were not told, never `[]`. `[]` is a real answer — "the ticket carries
    // no roles" — and picks the tie-break's `no` branch, which would be us guessing.
    ticketRoleCodes: ticketRoles?.map((role) => role.roleCode),
  });

  if (lookup.kind === "ambiguous") {
    return {
      ok: true,
      result: {
        allowed: !blocked,
        nextStatus: null,
        ambiguousNext: lookup.candidates,
        coverage: "TABLE",
        outOfScopeGuards,
        ...contentFields,
        message: say(
          lookup.needsTicketRole
            ? `Two transitions share this key; send \`ticketRoles\` so we can tell whether the ` +
                `ticket carries ${lookup.needsTicketRole}.`
            : "Two transitions share this key and the table offers no rule to choose between them.",
        ),
      },
    };
  }

  if (lookup.kind === "not-found") {
    if (lookup.roleMismatch) {
      // The one place C refuses. The table does describe this status and action, and none of its
      // rows apply to the roles this person holds — which is exactly the condition EVN's gate
      // reports as `isPermission: false`. Unreachable unless the request carried `ticketRoles`, so
      // it cannot fire while B1 is unanswered. It is no longer the ONLY refusal, though — an unmet
      // content requirement refuses without `ticketRoles`; see the note on `decideTransition`.
      return {
        ok: true,
        result: {
          allowed: false,
          nextStatus: null,
          ambiguousNext: [],
          coverage: "TABLE",
          outOfScopeGuards,
          ...contentFields,
          message: say(
            "No transition for this action is open to the roles this user holds on the ticket.",
          ),
        },
      };
    }
    // We do not know, so we do not refuse: `PCT_S_MODERATION` is reached by a path outside the
    // table, and a false rejection here blocks real work. The content guard is a separate question
    // and does not depend on the table, so it can still refuse here.
    return {
      ok: true,
      result: {
        allowed: !blocked,
        nextStatus: null,
        ambiguousNext: [],
        coverage: "TABLE_INCOMPLETE",
        outOfScopeGuards,
        ...contentFields,
        message: say("No row for this status and action; the reply is advisory only.", true),
      },
    };
  }

  return {
    ok: true,
    result: {
      allowed: !blocked,
      // ⚠️ Second mechanism, independent of the table — see {@link resolveNextStatus}. Against
      // today's table it changes nothing, and it is applied at runtime anyway: it is the net for
      // the day their table stops agreeing with their code.
      //
      // Still reported when `allowed` is false: "this is where the ticket would go once the content
      // is complete" is useful, and suppressing it would make an incomplete ticket look like an
      // unknown transition.
      nextStatus: resolveNextStatus(actionCode, lookup.nextStatus),
      ambiguousNext: [],
      coverage: "TABLE",
      outOfScopeGuards,
      ...contentFields,
      message: say(""),
    },
  };
}
