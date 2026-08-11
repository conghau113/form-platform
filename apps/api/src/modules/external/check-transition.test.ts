import { describe, expect, it } from "vitest";
import {
  type CheckTransitionInput,
  decideTransition,
  resolveNextStatus,
} from "./check-transition.js";
import { EVN_NO_STATUS_CHANGE_ACTIONS, EVN_PCT_GUARDS } from "./evn-guards.js";
import { EVN_PCT_TRANSITIONS, EVN_STATUS_NA } from "./evn-transitions.js";
import { lookupTransition } from "./transition-table.js";

/** A well-formed request; each test overrides only what it is about. */
function request(over: Partial<CheckTransitionInput>): CheckTransitionInput {
  return {
    ticketTypeCode: "PCT",
    currentStatusCode: "PCT_S_MODERATION",
    actionCode: "PCT_A_WORKING",
    executorUserCode: "emp001",
    ...over,
  };
}

describe("decideTransition — the verdict", () => {
  it("answers the table, not EVN's own documented example", () => {
    // Their §12.C sample sends PCT_S_CREATED + PCT_A_WORKING and shows `PCT_S_ALLOWED_WAITING`.
    // The table has one row for that action and it starts at PCT_S_MODERATION.
    expect(decideTransition(request({}))).toEqual({
      allowed: true,
      nextStatus: "PCT_S_WORKING",
      ambiguousNext: [],
      coverage: "TABLE",
      outOfScopeGuards: EVN_PCT_GUARDS.PCT_A_WORKING,
      message: "",
    });

    const documented = decideTransition(request({ currentStatusCode: "PCT_S_CREATED" }));
    // Not a refusal: an integrator following their own doc must not be told "no", only "I have
    // nothing on this".
    expect(documented.allowed).toBe(true);
    expect(documented.nextStatus).toBeNull();
    expect(documented.coverage).toBe("TABLE_INCOMPLETE");
  });

  it("refuses to guess between two transitions when it was not told the ticket's roles", () => {
    const ambiguous = decideTransition(
      request({ currentStatusCode: "PCT_S_WORKING", actionCode: "PCT_A_ALLOW" }),
    );
    expect(ambiguous.nextStatus).toBeNull();
    expect(ambiguous.ambiguousNext).toEqual(["PCT_S_ALLOWED_WAITING", "PCT_S_ALLOWED"]);
    expect(ambiguous.allowed).toBe(true);
    expect(ambiguous.message).toContain("PCT_R_LANH_DAO");
  });

  it("picks the branch the ticket's roles decide, once it has them", () => {
    // ⚠️ The executor must hold the row's own role (PCT_R_CHO_PHEP) in BOTH cases, or the role
    // filter rejects the request before the tie-break is ever consulted and this test would be
    // measuring the wrong thing.
    const withLeader = decideTransition(
      request({
        currentStatusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        ticketRoles: [
          { roleCode: "PCT_R_CHO_PHEP", userCode: "emp001" },
          { roleCode: "PCT_R_LANH_DAO", userCode: "emp009" },
        ],
      }),
    );
    expect(withLeader.nextStatus).toBe("PCT_S_ALLOWED_WAITING");
    expect(withLeader.ambiguousNext).toEqual([]);

    const withoutLeader = decideTransition(
      request({
        currentStatusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        ticketRoles: [{ roleCode: "PCT_R_CHO_PHEP", userCode: "emp001" }],
      }),
    );
    expect(withoutLeader.nextStatus).toBe("PCT_S_ALLOWED");
  });

  it("refuses only when the roles ARE known and none of them opens the action", () => {
    // The fixture puts the authorising role on somebody else on purpose. If the executor's roles
    // were derived as "every role on the ticket" — the easy mistake — PCT_R_CHO_PHEP would be found
    // here and this would wrongly pass.
    const mismatch = decideTransition(
      request({
        currentStatusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        ticketRoles: [
          { roleCode: "PCT_R_CHO_PHEP", userCode: "someone-else" },
          { roleCode: "PCT_R_NHAN_VIEN", userCode: "emp001" },
        ],
      }),
    );
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.coverage).toBe("TABLE");

    // Same request without the roles: we were not told, so we do not refuse.
    const untold = decideTransition(
      request({ currentStatusCode: "PCT_S_WORKING", actionCode: "PCT_A_ALLOW" }),
    );
    expect(untold.allowed).toBe(true);
  });

  it("never refuses a status/action pair it simply has no row for", () => {
    const unknown = decideTransition(
      request({ currentStatusCode: "PCT_S_DRAFT", actionCode: "PCT_A_ALLOW" }),
    );
    expect(unknown).toMatchObject({
      allowed: true,
      nextStatus: null,
      coverage: "TABLE_INCOMPLETE",
    });
  });

  it("says plainly that it holds no table for another ticket type", () => {
    const lct = decideTransition(request({ ticketTypeCode: "LCT", actionCode: "LCT_A_WORKING" }));
    expect(lct).toMatchObject({ allowed: true, nextStatus: null, coverage: "NO_TABLE" });
    // The guard list is OMITTED, not empty — by the same rule that keeps `requiredFields` out
    // altogether. `[]` for a ticket type we measured nothing about would read as "we looked, there
    // is nothing left for you to check", which is the strongest claim from the least knowledge.
    expect("outOfScopeGuards" in lct).toBe(false);
  });

  it("still names the guards when it cannot resolve or must refuse", () => {
    // Both branches return early, so each needs its own assertion: dropping the guard list from
    // either one would leave the happy-path tests entirely green while telling a caller mid-refusal
    // that they have nothing left to check.
    const ambiguous = decideTransition(
      request({ currentStatusCode: "PCT_S_ALLOWED", actionCode: "PCT_A_HANDOVER" }),
    );
    expect(ambiguous.coverage).toBe("TABLE");
    expect(ambiguous.outOfScopeGuards).toEqual(EVN_PCT_GUARDS.PCT_A_HANDOVER);

    const refused = decideTransition(
      request({
        currentStatusCode: "PCT_S_ALLOWED",
        actionCode: "PCT_A_HANDOVER",
        ticketRoles: [{ roleCode: "PCT_R_NHAN_VIEN", userCode: "emp001" }],
      }),
    );
    expect(refused.allowed).toBe(false);
    expect(refused.outOfScopeGuards).toEqual(EVN_PCT_GUARDS.PCT_A_HANDOVER);
  });

  it("does not read guards off the prototype chain", () => {
    // `@IsString()` admits "toString" as an action code, and a plain `EVN_PCT_GUARDS[actionCode]`
    // then returns a Function — which `JSON.stringify` DROPS, handing the caller a body missing a
    // member the contract declares. `"__proto__"` yields `{}` instead. Measured, not hypothetical.
    for (const actionCode of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      const body = decideTransition(request({ actionCode }));
      expect(body.outOfScopeGuards).toEqual([]);
      expect(JSON.parse(JSON.stringify(body)).outOfScopeGuards).toEqual([]);
    }
  });

  it("omits requiredFields on EVERY reply shape, not just the one that was measured", () => {
    // `[]` would read as "checked, nothing missing" — but P4b checks nothing, and EVN really does
    // run `checkContentFinished` on the way in. Absent forces the question; the guard list answers it.
    //
    // Every branch, because the claim in the docstring and in the handover doc is about the ENDPOINT:
    // one branch quietly gaining the field would make both of them false while a single-case
    // assertion stayed green. The key SET is pinned, so an extra member anywhere is red.
    const shapes: Array<[string, ReturnType<typeof decideTransition>]> = [
      ["resolved", decideTransition(request({}))],
      [
        "ambiguous",
        decideTransition(
          request({ currentStatusCode: "PCT_S_WORKING", actionCode: "PCT_A_ALLOW" }),
        ),
      ],
      [
        "refused",
        decideTransition(
          request({
            currentStatusCode: "PCT_S_WORKING",
            actionCode: "PCT_A_ALLOW",
            ticketRoles: [{ roleCode: "PCT_R_NHAN_VIEN", userCode: "emp001" }],
          }),
        ),
      ],
      ["incomplete", decideTransition(request({ currentStatusCode: "PCT_S_DRAFT" }))],
      ["no-table", decideTransition(request({ ticketTypeCode: "LCT" }))],
    ];

    for (const [shape, body] of shapes) {
      const expected =
        shape === "no-table"
          ? ["allowed", "nextStatus", "ambiguousNext", "coverage", "message"]
          : ["allowed", "nextStatus", "ambiguousNext", "coverage", "outOfScopeGuards", "message"];
      expect({ shape, keys: Object.keys(body).sort() }).toEqual({
        shape,
        keys: [...expected].sort(),
      });
    }

    const end = decideTransition(
      request({ actionCode: "PCT_A_END", currentStatusCode: "PCT_S_HANDOVERED" }),
    );
    expect(end.outOfScopeGuards).toContain("CONTENT_FINISHED");
  });

  it("pins what each reply shape SAYS, because the message is contract text too", () => {
    // The integrator reads this string; nothing else in the reply explains why `nextStatus` is null
    // or what to send to resolve it. Pinning the exact wording is deliberately strict — a reword
    // that flipped an advisory reply into something reading like a refusal would otherwise ship
    // green, and this endpoint's whole contract rests on "allowed: true" not meaning "permitted".
    expect(decideTransition(request({})).message).toBe("");
    expect(decideTransition(request({ currentStatusCode: "PCT_S_DRAFT" })).message).toBe(
      "No row for this status and action; the reply is advisory only.",
    );
    expect(decideTransition(request({ ticketTypeCode: "LCT" })).message).toBe(
      'No transition table for ticket type "LCT"; this reply decides nothing.',
    );
    expect(
      decideTransition(request({ currentStatusCode: "PCT_S_WORKING", actionCode: "PCT_A_ALLOW" }))
        .message,
    ).toBe(
      "Two transitions share this key; send `ticketRoles` so we can tell whether the ticket " +
        "carries PCT_R_LANH_DAO.",
    );
    expect(
      decideTransition(
        request({
          currentStatusCode: "PCT_S_WORKING",
          actionCode: "PCT_A_ALLOW",
          ticketRoles: [{ roleCode: "PCT_R_NHAN_VIEN", userCode: "emp001" }],
        }),
      ).message,
    ).toBe("No transition for this action is open to the roles this user holds on the ticket.");
  });

  it("gives the one action that legitimately has no guards an empty list, not a missing one", () => {
    // `PCT_A_NHANVIEN_NOT_READY` is measured — it has ten rows in the table — and EVN runs no guard
    // on it. So `[]` here is a true statement rather than the empty claim `NO_TABLE` would be
    // making, and it is the only production reply where the distinction shows.
    const body = decideTransition(
      request({ currentStatusCode: "PCT_S_HANDOVERED", actionCode: "PCT_A_NHANVIEN_NOT_READY" }),
    );
    expect(body.outOfScopeGuards).toEqual([]);
    expect(body.coverage).toBe("TABLE");
  });

  it("never leaks the S_N/A sentinel into a reply", () => {
    // `ambiguousNext` inherits `candidates`, which `transition-table.ts` documents as raw. No key
    // mixes an absent with a present next status today, so nothing should surface it.
    //
    // Every row is walked three ways, because the branch that COULD surface the sentinel is not the
    // same one in each: without roles the ambiguous branch runs (that is where `candidates` is
    // handed over raw), with the matching role the tie-break resolves, and with a foreign role the
    // refusal branch answers. Walking only the first would leave two thirds of the reply shapes
    // unvisited while the test's name claims "never".
    for (const row of EVN_PCT_TRANSITIONS) {
      const bodies = [
        decideTransition(
          request({ currentStatusCode: row.statusCode, actionCode: row.actionCode }),
        ),
        decideTransition(
          request({
            currentStatusCode: row.statusCode,
            actionCode: row.actionCode,
            ticketRoles: [{ roleCode: row.roleCode, userCode: "emp001" }],
          }),
        ),
        decideTransition(
          request({
            currentStatusCode: row.statusCode,
            actionCode: row.actionCode,
            ticketRoles: [{ roleCode: "PCT_R_NOT_A_REAL_ROLE", userCode: "emp001" }],
          }),
        ),
      ];
      for (const body of bodies) expect(JSON.stringify(body)).not.toContain(EVN_STATUS_NA);
    }
  });
});

describe("resolveNextStatus — the net for the table drifting", () => {
  // Tested directly, because through `decideTransition` it cannot be tested at all: the committed
  // table already resolves all six of these to `null`, so deleting the net leaves every other test
  // green. This is the only place a next status EVN would not perform can be simulated.
  it("suppresses a next status the table might one day carry for these actions", () => {
    for (const action of EVN_NO_STATUS_CHANGE_ACTIONS) {
      expect(resolveNextStatus(action, "PCT_S_END")).toBeNull();
    }
  });

  it("leaves every other action's next status alone", () => {
    expect(resolveNextStatus("PCT_A_WORKING", "PCT_S_WORKING")).toBe("PCT_S_WORKING");
    expect(resolveNextStatus("PCT_A_WORKING", null)).toBeNull();
  });
});

describe("the guard table endpoint C reports", () => {
  it("names the cross-ticket check on BOTH actions that run it", () => {
    // The second site sits three levels down inside a `Promise.all(_.map(...))`
    // (`ticket.service.ts:4956`), which is exactly how it gets missed.
    expect(EVN_PCT_GUARDS.PCT_A_NHANVIEN_CHECKIN).toContain("EMPLOYEE_CHECKIN_ACROSS_TICKETS");
    expect(EVN_PCT_GUARDS.PCT_A_CHTT_NHANVIEN_CHECKIN).toContain("EMPLOYEE_CHECKIN_ACROSS_TICKETS");
  });

  it("keeps CONTENT_FINISHED on exactly the five actions ACTION_FINISH_CONTENT lists", () => {
    const withContent = Object.entries(EVN_PCT_GUARDS)
      .filter(([, guards]) => guards.includes("CONTENT_FINISHED"))
      .map(([action]) => action)
      .sort();
    expect(withContent).toEqual([
      "PCT_A_ALLOW",
      "PCT_A_ALLOW_HANDOVER",
      "PCT_A_CONFIRM_LOCK",
      "PCT_A_END",
      "PCT_A_HANDOVER",
    ]);
  });

  it("keeps the whole-ticket checkout check on PCT_A_END alone", () => {
    const withCheckout = Object.entries(EVN_PCT_GUARDS)
      .filter(([, guards]) => guards.includes("EMPLOYEE_CHECKOUT_ALL"))
      .map(([action]) => action);
    expect(withCheckout).toEqual(["PCT_A_END"]);
  });

  it("pins the whole table, so the promise that it only ever shrinks is checkable", () => {
    // Spot checks cannot enforce "this list only shrinks as later slices implement guards" — they
    // say nothing about the actions they do not name. The whole map is the enforcement: P4c removing
    // CONTENT_FINISHED must show up here as a deletion, and a guard appearing out of nowhere (a
    // generator drift, a hand edit) has to be acknowledged rather than absorbed.
    expect(EVN_PCT_GUARDS).toEqual({
      PCT_A_ALLOW: ["CONTENT_FINISHED"],
      PCT_A_ALLOW_HANDOVER: ["CONTENT_FINISHED"],
      PCT_A_CHTT_END_WORK: ["EXISTED_WORKING_AND_NCP_SIGN"],
      PCT_A_CHTT_NHANVIEN_CHECKIN: [
        "CHTT_IS_WORKING",
        "EMPLOYEE_CHECKIN_ACROSS_TICKETS",
        "HAS_EMPLOYEES_CAN_CHECKIN_BY_CHTT",
      ],
      PCT_A_CHTT_NHANVIEN_CHECKOUT: ["CHTT_IS_WORKING", "HAS_EMPLOYEES_CAN_CHECKOUT_BY_CHTT"],
      PCT_A_CHTT_START_WORK: ["CHTT_START_WORK_PCT"],
      PCT_A_CONFIRM_LOCK: ["CONTENT_FINISHED"],
      PCT_A_CONTINUE_WORK: ["CHTT_IS_WORKING"],
      PCT_A_END: [
        "CHTT_IS_WORKING",
        "CONTENT_FINISHED",
        "EMPLOYEE_ATTENDANCE_NOT_OUT",
        "EMPLOYEE_CHECKOUT_ALL",
      ],
      PCT_A_END_INPUT: ["CHTT_IS_WORKING"],
      PCT_A_HALT: ["CHTT_IS_WORKING"],
      PCT_A_HANDOVER: ["CHTT_IS_WORKING", "CONTENT_FINISHED"],
      PCT_A_HANDOVER_APPROVED: ["GSATD_IS_WORKING"],
      PCT_A_HANDOVER_INPUT: ["CHTT_IS_WORKING"],
      PCT_A_NCP_START_WORK: ["EXISTED_WORKING_AND_CHTT_SIGN"],
      PCT_A_NHANVIEN_CHECKIN: ["EMPLOYEE_CAN_CHECKIN_BY_SELF", "EMPLOYEE_CHECKIN_ACROSS_TICKETS"],
      PCT_A_NHANVIEN_CHECKOUT: ["EMPLOYEE_CAN_CHECKOUT_BY_SELF"],
      PCT_A_NHANVIEN_CONFIRM: ["EMPLOYEE_CAN_CONFIRM"],
      PCT_A_POSTPONE: ["CHTT_IS_WORKING"],
      PCT_A_UPLOAD: ["TICKET_IS_UPLOAD"],
      PCT_A_WORKING: ["CHTT_IS_WORKING", "CONDITION_TO_WORK"],
    });
  });

  it("reports the PRE-CHECK surface too, not just the write path", () => {
    // C stands in for `getActionForUserByTicketId`, so guards that merely hide an action from a
    // user's menu belong here as much as the ones that throw. Losing this half would let a caller
    // believe C had considered a question it never asked.
    expect(EVN_PCT_GUARDS.PCT_A_WORKING).toEqual(
      expect.arrayContaining(["CHTT_IS_WORKING", "CONDITION_TO_WORK"]),
    );
    expect(EVN_PCT_GUARDS.PCT_A_HANDOVER_APPROVED).toContain("GSATD_IS_WORKING");
  });
});

describe("drift sensor: the table against EVN's second mechanism", () => {
  it("still agrees that the six no-status-change actions move nothing", () => {
    // Two INDEPENDENT mechanisms: `changeStatus = false` in the action's own branch
    // (`ticket.service.ts:5191` gates the write) and whatever `status_code_next` the table carries.
    // They agree today by coincidence, not by construction. This reads the committed table directly
    // — not through `decideTransition`, which forces `null` for these actions and would therefore
    // hide the drift this test exists to catch.
    for (const action of EVN_NO_STATUS_CHANGE_ACTIONS) {
      for (const row of EVN_PCT_TRANSITIONS.filter((r) => r.actionCode === action)) {
        const lookup = lookupTransition({ statusCode: row.statusCode, actionCode: action });
        expect(
          lookup.kind === "resolved" ? lookup.nextStatus : "unexpected lookup kind",
        ).toBeNull();
      }
    }
  });

  it("pins how many rows each of them has, so a vanishing row is red too", () => {
    const counts = Object.fromEntries(
      EVN_NO_STATUS_CHANGE_ACTIONS.map((action) => [
        action,
        EVN_PCT_TRANSITIONS.filter((row) => row.actionCode === action).length,
      ]),
    );
    expect(counts).toEqual({
      PCT_A_CHTT_NHANVIEN_CHECKIN: 1,
      PCT_A_CHTT_NHANVIEN_CHECKOUT: 1,
      PCT_A_NHANVIEN_CHECKIN: 1,
      PCT_A_NHANVIEN_CHECKOUT: 1,
      PCT_A_NHANVIEN_CONFIRM: 10,
      PCT_A_NHANVIEN_NOT_READY: 10,
    });
  });
});
