import { EVN_NO_STATUS_CHANGE_ACTIONS, EVN_PCT_GUARDS } from "./evn-guards.js";
import { lookupTransition } from "./transition-table.js";

/**
 * Deciding one `POST /external/check-transition` (P4b).
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
   * predicate (`ticket.service.ts:8064`); only the "what can I do next" listing filters
   * (`ticket-action.service.ts:2587`). Handed the active subset we would answer `allowed: false` for
   * actions EVN lets through.
   */
  ticketRoles?: readonly { roleCode: string; userCode: string }[];
}

export interface CheckTransitionResult {
  allowed: boolean;
  /** `null` = this action does not move the ticket, or we could not tell. */
  nextStatus: string | null;
  /**
   * The next statuses the table offers when it cannot choose between them, in table order.
   *
   * Always present; `[]` means "no ambiguity", which is a claim we can make honestly. Contrast
   * `requiredFields`, which P4b omits entirely rather than sending `[]` — see the note on
   * {@link decideTransition}.
   */
  ambiguousNext: readonly string[];
  coverage: TransitionCoverage;
  /**
   * Guards EVN must still evaluate itself. See {@link EVN_PCT_GUARDS}.
   *
   * ⚠️ ABSENT when `coverage` is `NO_TABLE`, by the same rule that keeps `requiredFields` out of
   * this reply entirely: for a ticket type we hold nothing about, `[]` would read as "we looked,
   * nothing outstanding" — the strongest possible claim, made from the least possible knowledge.
   */
  outOfScopeGuards?: readonly string[];
  /** Human-readable and English. Two identical requests produce an identical string. */
  message: string;
}

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
 * ⚠️ The reply has NO `requiredFields`, though EVN's §12.C response shape lists one. That is not an
 * oversight: `[]` would state "checked, nothing missing" while nothing has been checked, and a
 * caller acting on it would skip a check EVN really does perform (`checkContentFinished`,
 * `ticket.service.ts:4750`). Absent forces the question; `CONTENT_FINISHED` in `outOfScopeGuards`
 * answers it. P4c adds the field once it is real.
 */
export function decideTransition(input: CheckTransitionInput): CheckTransitionResult {
  const { ticketTypeCode, currentStatusCode, actionCode, executorUserCode, ticketRoles } = input;
  const outOfScopeGuards = guardsFor(actionCode);

  if (ticketTypeCode !== EVN_PCT_TICKET_TYPE) {
    // Not a refusal. C is an advisory pre-check, so "I hold no table for this ticket type" must not
    // be spelled the same way as "EVN would reject this", and must not be an error either — a 404
    // here would make an unknown ticket type indistinguishable from a misrouted request.
    //
    // `outOfScopeGuards` is omitted rather than empty: our guard table is PCT's, and an empty list
    // for a type we never measured would claim there is nothing left to check.
    return {
      allowed: true,
      nextStatus: null,
      ambiguousNext: [],
      coverage: "NO_TABLE",
      message: `No transition table for ticket type "${ticketTypeCode}"; this reply decides nothing.`,
    };
  }

  const lookup = lookupTransition({
    statusCode: currentStatusCode,
    actionCode,
    // Only the roles held by the PERSON ACTING, mirroring `isPermission` (`ticket.service.ts:8077`,
    // which matches rows on `trv.user_code == executor`). Passing every role on the ticket here
    // would make the role filter match something for almost any executor, so `roleMismatch` would
    // never fire and C would silently stop being able to refuse.
    executorRoleCodes: ticketRoles
      ? ticketRoles.filter((role) => role.userCode === executorUserCode).map((r) => r.roleCode)
      : undefined,
    // Whereas the tie-break asks whether ANYONE on the ticket holds a role
    // (`checkRoleCodeExistInTicket`, `ticket-action.service.ts:1659`).
    //
    // ⚠️ `undefined` when we were not told, never `[]`. `[]` is a real answer — "the ticket carries
    // no roles" — and picks the tie-break's `no` branch, which would be us guessing.
    ticketRoleCodes: ticketRoles?.map((role) => role.roleCode),
  });

  if (lookup.kind === "ambiguous") {
    return {
      allowed: true,
      nextStatus: null,
      ambiguousNext: lookup.candidates,
      coverage: "TABLE",
      outOfScopeGuards,
      message: lookup.needsTicketRole
        ? `Two transitions share this key; send \`ticketRoles\` so we can tell whether the ticket ` +
          `carries ${lookup.needsTicketRole}.`
        : "Two transitions share this key and the table offers no rule to choose between them.",
    };
  }

  if (lookup.kind === "not-found") {
    if (lookup.roleMismatch) {
      // The one place C refuses. The table does describe this status and action, and none of its
      // rows apply to the roles this person holds — which is exactly the condition EVN's gate
      // reports as `isPermission: false`. Unreachable unless the request carried `ticketRoles`, so
      // it cannot fire while B1 is unanswered.
      return {
        allowed: false,
        nextStatus: null,
        ambiguousNext: [],
        coverage: "TABLE",
        outOfScopeGuards,
        message:
          "No transition for this action is open to the roles this user holds on the ticket.",
      };
    }
    // We do not know, so we do not refuse: `PCT_S_MODERATION` is reached by a path outside the
    // table, and a false rejection here blocks real work.
    return {
      allowed: true,
      nextStatus: null,
      ambiguousNext: [],
      coverage: "TABLE_INCOMPLETE",
      outOfScopeGuards,
      message: "No row for this status and action; the reply is advisory only.",
    };
  }

  return {
    allowed: true,
    // ⚠️ Second mechanism, independent of the table — see {@link resolveNextStatus}. Against
    // today's table it changes nothing, and it is applied at runtime anyway: it is the net for the
    // day their table stops agreeing with their code.
    nextStatus: resolveNextStatus(actionCode, lookup.nextStatus),
    ambiguousNext: [],
    coverage: "TABLE",
    outOfScopeGuards,
    message: "",
  };
}
