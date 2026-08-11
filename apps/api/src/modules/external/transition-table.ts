import {
  EVN_PCT_TIE_BREAKS,
  EVN_PCT_TRANSITIONS,
  EVN_ROLE_WILDCARD,
  EVN_STATUS_NA,
  type EvnTransitionRow,
} from "./evn-transitions.js";

/**
 * Reading EVN's PCT transition table (P4a).
 *
 * Pure, and deliberately so: everything endpoint C concludes comes from here, and this file needs no
 * HTTP, no DI and no database to be tested against the real table.
 *
 * Mirrors the check EVN performs on the way into a transition: `checkPermisstionToAction`
 * (`core-service/src/modules/ticket/service/ticket.service.ts:8059-8089`, called from
 * `updateStatus:4737`) matches on the ticket's current status, the action, and
 * `role_code IN (the executor's roles on this ticket) OR role_code = 'R_NA'`.
 *
 * ⚠️ Not `getActionStatusNext` (`ticket-action.service.ts:2578-2598`), which looks similar but never
 * filters by action — it is the "what can I do next" listing, not the gate. The two differ where it
 * matters: the listing filters the executor's ticket roles on `active`, the gate does not.
 *
 * ⚠️ The gate takes `data[0]` of a query with no ORDER BY and no role filter (`:8076`). That is
 * harmless only because no `(status, action)` in their table spans two roles — an invariant both the
 * generator and `transition-table.test.ts` assert — and because `updateStatus` overrides
 * `statusNext` for the three keys that do carry two rows (`ticket.service.ts:5199-5224`).
 */

export interface TransitionQuery {
  statusCode: string;
  actionCode: string;
  /**
   * Roles the person acting holds ON THIS TICKET.
   *
   * `undefined` means we were not told — EVN's §12.C request carries `executorUserCode` but no roles
   * (that is the open question B1). We then match on any role and the answer is weaker, which is why
   * {@link TransitionLookup} distinguishes "no such row" from "no row for that role".
   *
   * ⚠️ Must NOT be filtered on `active` either. The gate left-joins `ticket_role_values` with no
   * `active` predicate (`ticket.service.ts:8064`); only the listing `getActionStatusNext` filters
   * (`ticket-action.service.ts:2587`). If B1 comes back with the active subset we would answer
   * `roleMismatch` for actions EVN lets through.
   */
  executorRoleCodes?: readonly string[];
  /**
   * Every role assigned on the ticket, whoever holds it — used only to break a tie.
   *
   * Must NOT be filtered on `active`: `checkRoleCodeExistInTicket` (`ticket-action.service.ts:1659`)
   * does not filter, and neither does the gate this file mirrors. Asking EVN for the active subset
   * would quietly give us a different set from the one they decide with.
   *
   * ⚠️ `undefined` and `[]` mean different things and the caller must not conflate them. `undefined`
   * is "we were not told" and yields `ambiguous`; `[]` is "we asked, the ticket carries no roles" and
   * picks the `no` branch. Passing `[]` for a request that simply omitted the field is a silent guess.
   */
  ticketRoleCodes?: readonly string[];
}

export type TransitionLookup =
  | {
      kind: "not-found";
      /**
       * True when the table does have rows for this status and action, but none for the executor's
       * role — the case EVN would actually refuse. Not derivable by the caller, and the two cases
       * deserve different wording in the response.
       */
      roleMismatch: boolean;
    }
  | {
      kind: "resolved";
      /**
       * `null` means the action leaves the status alone. Covers both ways the table says that: the
       * column being absent (default `S_N/A`) and a row naming the status it already has.
       * `S_N/A` is never handed back to a caller as if it were a status.
       */
      nextStatus: string | null;
      source: "flow" | "loop";
    }
  | {
      kind: "ambiguous";
      /**
       * The next statuses the table offers, in table order.
       *
       * ⚠️ Raw, unlike `resolved.nextStatus`: if an ambiguous key ever mixed a row that omits the
       * next status with one that names it, `S_N/A` would appear here. No such key exists today.
       */
      candidates: readonly string[];
      /** The role whose presence on the ticket would decide it; `null` if the table offers no rule. */
      needsTicketRole: string | null;
    };

/** `S_N/A`, or a row restating the status it is already in, both mean "no change". */
function nextStatusOf(row: EvnTransitionRow, statusCode: string): string | null {
  const next = row.statusCodeNext ?? EVN_STATUS_NA;
  return next === EVN_STATUS_NA || next === statusCode ? null : next;
}

export function lookupTransition(query: TransitionQuery): TransitionLookup {
  const { statusCode, actionCode, executorRoleCodes, ticketRoleCodes } = query;

  const byKey = EVN_PCT_TRANSITIONS.filter(
    (row) => row.statusCode === statusCode && row.actionCode === actionCode,
  );
  if (byKey.length === 0) return { kind: "not-found", roleMismatch: false };

  const matched = executorRoleCodes
    ? byKey.filter(
        (row) => row.roleCode === EVN_ROLE_WILDCARD || executorRoleCodes.includes(row.roleCode),
      )
    : byKey;
  const [first] = matched;
  if (!first) return { kind: "not-found", roleMismatch: true };

  const distinct = [...new Set(matched.map((row) => row.statusCodeNext ?? EVN_STATUS_NA))];
  if (distinct.length === 1) {
    return { kind: "resolved", nextStatus: nextStatusOf(first, statusCode), source: first.source };
  }

  // The `!tieBreak` arm below, the `?? first` fallback, and `chosen === statusCode` are unreachable
  // against today's table — the generator's gates guarantee every ambiguous key has a tie-break whose
  // outcomes are rows that exist and never restate the current status. They are defensive, kept so
  // that a table which grows a case we cannot resolve says so instead of guessing.
  const tieBreak = EVN_PCT_TIE_BREAKS.find((entry) => entry.actionCode === actionCode);
  if (!tieBreak || !ticketRoleCodes) {
    return {
      kind: "ambiguous",
      candidates: distinct,
      needsTicketRole: tieBreak?.requiresTicketRole ?? null,
    };
  }

  const chosen = ticketRoleCodes.includes(tieBreak.requiresTicketRole) ? tieBreak.yes : tieBreak.no;
  const row = matched.find((candidate) => candidate.statusCodeNext === chosen) ?? first;
  return {
    kind: "resolved",
    nextStatus: chosen === statusCode ? null : chosen,
    source: row.source,
  };
}
