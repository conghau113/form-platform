import { describe, expect, it } from "vitest";
import {
  type CheckTransitionInput,
  type CheckTransitionResult,
  decideTransition as decideRaw,
  resolveNextStatus,
} from "./check-transition.js";
import { EVN_PCT_DEFINITION_VERSION } from "./definition-version.js";
import { EVN_NO_STATUS_CHANGE_ACTIONS, EVN_PCT_GUARDS } from "./evn-guards.js";
import { EVN_PCT_REQUIRED_CONTENT } from "./evn-required-fields.js";
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

/**
 * The verdict, insisting there was one.
 *
 * P4c gave `decideTransition` a second outcome — "this `ticketData` is unreadable", which the
 * service turns into a 422 — so it now returns a union. Tests that are about the verdict say so by
 * going through here; the ones about the refusal use `decideRaw` directly. Throwing rather than
 * asserting keeps the failure at the line that made the request.
 */
function decideTransition(input: CheckTransitionInput): CheckTransitionResult {
  const decision = decideRaw(input);
  if (!decision.ok) {
    throw new Error(`expected a verdict, got unusable: ${JSON.stringify(decision.unusable)}`);
  }
  return decision.result;
}

/** Rows that satisfy every pair of an action, so a test can vary one thing and keep the rest valid. */
function completeContent(actionCode: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const pair of EVN_PCT_REQUIRED_CONTENT[actionCode] ?? []) {
    data[pair.itemCode] = [{ [pair.mark]: true }];
  }
  return data;
}

/**
 * A `ticketData` carrying stored workflow state, in the shape EVN writes it
 * (`workflow.service.ts:1114-1118`): the first two nodes complete, the rest not yet reached.
 */
function storedNodes(): Record<string, unknown> {
  return {
    WORKFLOW_NODES: {
      data: {
        PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" },
        PCT_WORKFLOW_NODE__PCT_A_CREATED: { id: "2", status: "COMPLETED" },
        PCT_WORKFLOW_NODE__PCT_A_WORKING: { id: "3", status: "ADDED" },
      },
    },
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
      // `PCT_A_WORKING` carries no content guard, so both lists are empty WITHOUT any `ticketData`
      // having been sent. That is a real answer, not a default — see the shape test below.
      requiredFields: [],
      unverifiedFields: [],
      // No `ticketData` at all, so the workflow was not projected — and says so, rather than
      // reporting a ticket that has completed none of its 15 nodes.
      progress: null,
      unverifiedWorkflow: [{ itemCode: "WORKFLOW_NODES", reason: "TICKET_DATA_ABSENT" }],
      definitionVersion: EVN_PCT_DEFINITION_VERSION,
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

  it("carries the content fields on EVERY reply shape except NO_TABLE, and nowhere else", () => {
    // The rule is one line and deliberately does not mention `ticketData`: the two content fields
    // are present exactly when `coverage !== "NO_TABLE"`. A field that appears and disappears with
    // an input unrelated to it is a contract nobody can code against — and the first draft of P4c
    // had three rules that disagreed about precisely this.
    //
    // Every branch, because the claim in the docstring and in the handover doc is about the
    // ENDPOINT: one branch quietly losing or gaining a field would make both of them false while a
    // single-case assertion stayed green. The key SET is pinned, so any drift anywhere is red.
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
      // The four P4c branches, which is where the rule is easiest to break.
      [
        "content-absent",
        decideTransition(request({ actionCode: "PCT_A_END", currentStatusCode: "PCT_S_ALLOWED" })),
      ],
      [
        "content-complete",
        decideTransition(
          request({
            actionCode: "PCT_A_END",
            currentStatusCode: "PCT_S_ALLOWED",
            ticketData: completeContent("PCT_A_END"),
          }),
        ),
      ],
      [
        "content-missing",
        decideTransition(
          request({
            actionCode: "PCT_A_END",
            currentStatusCode: "PCT_S_ALLOWED",
            ticketData: { PARTICIPANTS_WORKSITE: [{ MARKED: false }] },
          }),
        ),
      ],
      // An action with no content guard AND a `ticketData` it has no use for: still `[]`/`[]`.
      ["no-content-guard", decideTransition(request({ ticketData: { ANYTHING: [] } }))],
      // ⚠️ The nine shapes above ALL leave `progress` null, because not one of them sends
      // `WORKFLOW_NODES` — so they cannot tell a real projection from a hardcoded null.
      // Measured, with the four twins below removed: hardcoding `progress: null` at the ambiguous
      // literal left this whole file GREEN, and goes red once they are back. (Omitting the key or
      // setting it to `undefined` is caught either way, by the key-set gate and the wire gate
      // respectively — it is the plausible-looking `null` that needed a shape carrying real state.)
      ["resolved+wf", decideTransition(request({ ticketData: storedNodes() }))],
      [
        "ambiguous+wf",
        decideTransition(
          request({
            currentStatusCode: "PCT_S_WORKING",
            actionCode: "PCT_A_ALLOW",
            ticketData: storedNodes(),
          }),
        ),
      ],
      [
        "refused+wf",
        decideTransition(
          request({
            currentStatusCode: "PCT_S_WORKING",
            actionCode: "PCT_A_ALLOW",
            ticketRoles: [{ roleCode: "PCT_R_NHAN_VIEN", userCode: "emp001" }],
            ticketData: storedNodes(),
          }),
        ),
      ],
      [
        "incomplete+wf",
        decideTransition(request({ currentStatusCode: "PCT_S_DRAFT", ticketData: storedNodes() })),
      ],
    ];

    for (const [shape, body] of shapes) {
      // `definitionVersion` is in BOTH arms on purpose: it is a claim about which snapshot of EVN's
      // tables this build holds, not a claim about the caller's ticket, so the rule that drops the
      // three ticket-shaped lists on `NO_TABLE` does not reach it. See its docstring.
      const expected =
        shape === "no-table"
          ? ["allowed", "nextStatus", "ambiguousNext", "coverage", "definitionVersion", "message"]
          : [
              "allowed",
              "nextStatus",
              "ambiguousNext",
              "coverage",
              "outOfScopeGuards",
              "requiredFields",
              "unverifiedFields",
              "progress",
              "unverifiedWorkflow",
              "definitionVersion",
              "message",
            ];
      expect({ shape, keys: Object.keys(body).sort() }).toEqual({
        shape,
        keys: [...expected].sort(),
      });
      // Presence is not the claim. The contract says the VALUE is one constant across every reply
      // this build gives, so three of the five result literals would otherwise be free to carry any
      // string at all — measured: hardcoding a different version at the ambiguous, roleMismatch and
      // TABLE_INCOMPLETE literals left the whole suite green without this line.
      expect({ shape, version: body.definitionVersion }).toEqual({
        shape,
        version: EVN_PCT_DEFINITION_VERSION,
      });

      // Same argument one field along: the key-set gate cannot tell a real projection from a null,
      // so the `+wf` shapes assert the VALUE. `storedNodes()` completes the first two nodes.
      if (shape === "no-table") continue;
      expect({ shape, completed: body.progress?.completed ?? null }).toEqual({
        shape,
        completed: shape.endsWith("+wf") ? 2 : null,
      });
    }

    // And the same for the serialised body: `undefined` members vanish through JSON, so a field set
    // to `undefined` rather than omitted would satisfy the check above and still reach the caller
    // missing. That is the exact failure the P4b review found with `outOfScopeGuards`.
    for (const [shape, body] of shapes) {
      const wire = Object.keys(JSON.parse(JSON.stringify(body))).sort();
      expect({ shape, wire }).toEqual({ shape, wire: Object.keys(body).sort() });
    }

    const end = decideTransition(
      request({ actionCode: "PCT_A_END", currentStatusCode: "PCT_S_HANDOVERED" }),
    );
    expect(end.outOfScopeGuards).toContain("CONTENT_FINISHED");
  });

  it("says nothing about an empty pin, which the DTO cannot send but a direct caller can", () => {
    // "You pinned definition version ``" helps nobody. Unreachable through HTTP — the DTO pattern
    // demands at least one character — but `decideTransition` is exported and called directly by
    // every test in this file, so the guard belongs where the function is, not only at the edge.
    expect(decideTransition(request({ pinnedDefinitionVersion: "" })).message).toBe("");
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

  it("gives an action that legitimately has no guards an empty list, not a missing one", () => {
    // `PCT_A_NHANVIEN_NOT_READY` is measured — it has ten rows in the table — and EVN runs no guard
    // on it. So `[]` here is a true statement, rather than the empty claim `NO_TABLE` would be
    // making by omitting the field.
    //
    // ⚠️ It is no longer the ONLY reply where the distinction shows, which is what this comment said
    // before P4c. `PCT_A_HALT` and `PCT_A_POSTPONE` joined it when the CRLF stripper fix withdrew
    // their spurious guard, and the three CONTENT_FINISHED-only actions reach `[]` whenever their
    // content evaluates clean.
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
    // (`ticket.service.ts:5002`), which is exactly how it gets missed.
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
    // say nothing about the actions they do not name. The whole map is the enforcement: a guard
    // appearing out of nowhere (a generator drift, a hand edit) has to be acknowledged rather than
    // absorbed. It earned its keep in P4c, which is the only reason the deletion below was noticed.
    //
    // ⚠️ `PCT_A_HALT` and `PCT_A_POSTPONE` LOST `CHTT_IS_WORKING` in P4c, and that is a fix, not a
    // regression. `stripLineComments` in both generators split on `"\n"` and matched `/.*$/`, but
    // EVN's sources are CRLF — `.` does not match the trailing `\r`, so the pattern matched nothing
    // and the stripper was a silent no-op. Both actions are COMMENTED OUT of `CHTT_ACTION`
    // (`ticket.constant.ts:1656-1657`) and were being read as live members. The error was in the
    // safe direction (a guard we wrongly list costs the caller a redundant check) and it now agrees
    // with the P4a measurement that these two carry no extra guard: they never enter `updateStatus`
    // at all, going through `updateStatusHaltTicket`/`updateStatusPostponeTicket` instead.
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
      PCT_A_HANDOVER: ["CHTT_IS_WORKING", "CONTENT_FINISHED"],
      PCT_A_HANDOVER_APPROVED: ["GSATD_IS_WORKING"],
      PCT_A_HANDOVER_INPUT: ["CHTT_IS_WORKING"],
      PCT_A_NCP_START_WORK: ["EXISTED_WORKING_AND_CHTT_SIGN"],
      PCT_A_NHANVIEN_CHECKIN: ["EMPLOYEE_CAN_CHECKIN_BY_SELF", "EMPLOYEE_CHECKIN_ACROSS_TICKETS"],
      PCT_A_NHANVIEN_CHECKOUT: ["EMPLOYEE_CAN_CHECKOUT_BY_SELF"],
      PCT_A_NHANVIEN_CONFIRM: ["EMPLOYEE_CAN_CONFIRM"],
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
    // (`ticket.service.ts:5237` gates the write) and whatever `status_code_next` the table carries.
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

describe("requiredFields — running EVN's content guard (P4c)", () => {
  /** `PCT_A_ALLOW` from a status the table resolves, so content is not the only thing under test. */
  const allow = (over: Partial<CheckTransitionInput> = {}) =>
    request({ actionCode: "PCT_A_ALLOW", currentStatusCode: "PCT_S_WORKING", ...over });

  it("evaluates nothing, and says so, when the request carried no ticketData", () => {
    // The heart of the slice. EVN reads these items from `ticket_items` in their own database; we
    // read them from a request field. "The caller did not tell us" must never be rendered as "we
    // checked and it is fine", so every pair is named as unverified AND the guard stays listed.
    const body = decideTransition(allow());
    expect(body.requiredFields).toEqual([]);
    expect(body.unverifiedFields).toEqual(
      EVN_PCT_REQUIRED_CONTENT.PCT_A_ALLOW?.map((pair) => ({
        ...pair,
        reason: "TICKET_DATA_ABSENT",
      })),
    );
    expect(body.outOfScopeGuards).toContain("CONTENT_FINISHED");
    expect(body.allowed).toBe(true);
  });

  it("treats an explicit null ticketData exactly like an absent one", () => {
    // Reachable, not hypothetical: `@IsOptional()` skips validation for `null` as well as
    // `undefined`, and `typeof null === "object"` would let a plain truthiness check through into
    // the evaluation path. Whoever writes `!ticketData` and whoever writes `=== undefined` get
    // different endpoints, so the choice is pinned rather than left to taste.
    expect(decideTransition(allow({ ticketData: null }))).toEqual(decideTransition(allow()));
  });

  it("evaluates the items it was given and flags only the ones it was not", () => {
    // The case that made 422-on-missing-key the wrong rule: a PCT ticket that never filled in item
    // 2.5 is a VALID ticket and EVN passes it (no row -> zero iterations). Refusing here would turn
    // their fail-open into our hard error on the happy path.
    const body = decideTransition(
      allow({
        ticketData: {
          POWER_RUN_OUT_DEVICE: [{ MARKED: true }],
          LOCATION_TO_EARTHING: [{ MARKED: true }],
          BARRIER_SIGNAGE: [{ MARKED: true }],
          // WARNING_INSTRUCTIONS deliberately absent.
        },
      }),
    );
    expect(body.allowed).toBe(true);
    expect(body.requiredFields).toEqual([]);
    expect(body.unverifiedFields).toEqual([
      { itemCode: "WARNING_INSTRUCTIONS", mark: "MARKED", type: "OBJ", reason: "ITEM_ABSENT" },
    ]);
    // Still outstanding, because one pair went unevaluated.
    expect(body.outOfScopeGuards).toContain("CONTENT_FINISHED");
  });

  it("drops CONTENT_FINISHED only once every pair was actually evaluated", () => {
    const body = decideTransition(allow({ ticketData: completeContent("PCT_A_ALLOW") }));
    expect(body.allowed).toBe(true);
    expect(body.requiredFields).toEqual([]);
    expect(body.unverifiedFields).toEqual([]);
    expect(body.outOfScopeGuards).not.toContain("CONTENT_FINISHED");
  });

  it("keeps the OTHER guards when it drops CONTENT_FINISHED", () => {
    // A weaker version of this test would use an action whose only guard is CONTENT_FINISHED, and
    // would then pass just as well if the filter removed everything. `PCT_A_END` carries four.
    const body = decideTransition(
      request({
        actionCode: "PCT_A_END",
        currentStatusCode: "PCT_S_ALLOWED",
        ticketData: completeContent("PCT_A_END"),
      }),
    );
    expect(body.outOfScopeGuards).toEqual([
      "CHTT_IS_WORKING",
      "EMPLOYEE_ATTENDANCE_NOT_OUT",
      "EMPLOYEE_CHECKOUT_ALL",
    ]);
  });

  it("refuses when a row is missing its mark, and names the pair", () => {
    const body = decideTransition(
      allow({
        ticketData: {
          ...completeContent("PCT_A_ALLOW"),
          BARRIER_SIGNAGE: [{ MARKED: true }, { MARKED: false }],
        },
      }),
    );
    expect(body.allowed).toBe(false);
    expect(body.requiredFields).toEqual([{ itemCode: "BARRIER_SIGNAGE", mark: "MARKED" }]);
    expect(body.message).toContain("requiredFields");
    // The transition itself is still reported: "this is where it would go once the content is
    // complete" is useful, and blanking it would make an incomplete ticket look like an unknown one.
    expect(body.coverage).toBe("TABLE");
  });

  it("lets content decide `allowed` in BOTH directions, holding everything else fixed", () => {
    // Scoped to the content dimension on purpose. `allowed: false` and "requiredFields is non-empty"
    // are NOT equivalent endpoint-wide — the role-mismatch branch refuses with `requiredFields: []`
    // — so a test named for a biconditional would claim more than it measures. What it does measure
    // is that content alone flips the verdict: either half on its own is weak, since a rule that
    // always refused would satisfy "missing content refuses" and one that never did would satisfy
    // "complete content allows".
    for (const [label, ticketData, expectedAllowed] of [
      ["complete", completeContent("PCT_A_ALLOW"), true],
      [
        "incomplete",
        { ...completeContent("PCT_A_ALLOW"), BARRIER_SIGNAGE: [{ MARKED: false }] },
        false,
      ],
    ] as const) {
      const body = decideTransition(allow({ ticketData }));
      expect({ label, allowed: body.allowed, blocked: body.requiredFields?.length !== 0 }).toEqual({
        label,
        allowed: expectedAllowed,
        blocked: !expectedAllowed,
      });
    }
  });

  it("passes an item with no rows, because EVN does", () => {
    // Their fail-open, reproduced ON PURPOSE. `_.forEach` over `[]` runs zero times, measured
    // against the lodash in their own repo. Tightening this would make C refuse tickets EVN accepts,
    // and a false refusal blocks real work. Do not "fix" it without changing their side first.
    const body = decideTransition(
      allow({ ticketData: { ...completeContent("PCT_A_ALLOW"), BARRIER_SIGNAGE: [] } }),
    );
    expect(body.allowed).toBe(true);
    expect(body.requiredFields).toEqual([]);
    expect(body.unverifiedFields).toEqual([]);
  });

  it("accepts the wrapped `{ data: [...] }` shape identically to the bare array", () => {
    // EVN assigns `itemTickets[code] = value.data`, so a caller may send either the rows or the
    // `ticket_items.value` they came out of. Detected by shape; neither is privileged.
    const wrapped = Object.fromEntries(
      Object.entries(completeContent("PCT_A_ALLOW")).map(([code, rows]) => [code, { data: rows }]),
    );
    expect(decideTransition(allow({ ticketData: wrapped }))).toEqual(
      decideTransition(allow({ ticketData: completeContent("PCT_A_ALLOW") })),
    );
  });

  it("declines to judge a mark spelled as an empty array, instead of refusing the ticket", () => {
    // The ONE place our evaluator is stricter than EVN's, and it is measured: `jsonLogic.truthy([])`
    // is false while lodash's `![]` is also false — so EVN PASSES the row and `none` FAILS it. That
    // direction produces a false refusal, which is worse than an unanswered question, and it is not
    // fixed by special-casing a verdict (that would be two ways of evaluating one guard).
    const body = decideTransition(
      allow({
        ticketData: { ...completeContent("PCT_A_ALLOW"), BARRIER_SIGNAGE: [{ MARKED: [] }] },
      }),
    );
    expect(body.allowed).toBe(true);
    expect(body.requiredFields).toEqual([]);
    expect(body.unverifiedFields).toEqual([
      {
        itemCode: "BARRIER_SIGNAGE",
        mark: "MARKED",
        type: "OBJ",
        reason: "TRUTHINESS_DISAGREEMENT",
      },
    ]);
    expect(body.outOfScopeGuards).toContain("CONTENT_FINISHED");
  });

  it("does not let one undecidable row swallow a refusal the other rows settle", () => {
    // The bug the first draft had: bailing out on the FIRST disagreeing row threw away the verdict
    // on every other row. Here the second row is falsy under BOTH rules — EVN definitively refuses —
    // so answering `allowed: true` because a sibling row was ambiguous would be a fail-open on a
    // ticket we can prove is incomplete. A disagreement may cost us a PASS we are unsure of, never
    // a refusal we are sure of.
    const body = decideTransition(
      allow({
        ticketData: {
          ...completeContent("PCT_A_ALLOW"),
          BARRIER_SIGNAGE: [{ MARKED: [] }, { MARKED: false }],
        },
      }),
    );
    expect(body.allowed).toBe(false);
    expect(body.requiredFields).toEqual([{ itemCode: "BARRIER_SIGNAGE", mark: "MARKED" }]);
    expect(body.unverifiedFields).toEqual([]);
  });

  it("keeps `type` off requiredFields and on unverifiedFields", () => {
    // `type` answers "which branch of EVN's checker is this", which is our business, not the
    // caller's — they need to know WHICH mark to fill in. It stays on `unverifiedFields`, where
    // `PAIR_NOT_MODELLED` is unreadable without it. The handover doc documents exactly these keys,
    // so a stray extra one is a doc that under-describes the payload.
    const refused = decideTransition(
      allow({ ticketData: { ...completeContent("PCT_A_ALLOW"), BARRIER_SIGNAGE: [{}] } }),
    );
    expect(Object.keys(refused.requiredFields?.[0] ?? {}).sort()).toEqual(["itemCode", "mark"]);

    const unverified = decideTransition(allow());
    expect(Object.keys(unverified.unverifiedFields?.[0] ?? {}).sort()).toEqual([
      "itemCode",
      "mark",
      "reason",
      "type",
    ]);
  });

  it("never calls a refusal advisory in the same breath", () => {
    // `TABLE_INCOMPLETE` normally says "the reply is advisory only". Printed next to `allowed:
    // false` that tells the caller to ignore the refusal they were just handed. The content guard
    // does not depend on the table, so when it blocks, the advisory half is replaced rather than
    // appended.
    const body = decideTransition(
      request({
        actionCode: "PCT_A_ALLOW",
        currentStatusCode: "PCT_S_DRAFT",
        ticketData: { ...completeContent("PCT_A_ALLOW"), BARRIER_SIGNAGE: [{ MARKED: false }] },
      }),
    );
    expect(body.coverage).toBe("TABLE_INCOMPLETE");
    expect(body.allowed).toBe(false);
    expect(body.message).toBe(
      "1 content requirement(s) are not met; see `requiredFields`. The transition itself could " +
        "not be looked up, so no next status is offered.",
    );
    expect(body.message).not.toContain("advisory");
  });

  it("reports requiredFields in EVN's declaration order, not sorted", () => {
    // `PCT_A_HANDOVER` declares C, I, P, L, B. Alphabetical would put BARRIER_SIGNAGE first, so a
    // stray `.sort()` — the easiest accidental change to make to a list like this — is caught.
    const body = decideTransition(
      request({
        actionCode: "PCT_A_HANDOVER",
        currentStatusCode: "PCT_S_ALLOWED",
        ticketData: {
          ...completeContent("PCT_A_HANDOVER"),
          CHECKED_INTERGRATED_AND_EARTHING: [{ MARKED: false }],
          BARRIER_SIGNAGE: [{ MARKED_IMAGE: false }],
        },
      }),
    );
    expect(body.requiredFields?.map((pair) => pair.itemCode)).toEqual([
      "CHECKED_INTERGRATED_AND_EARTHING",
      "BARRIER_SIGNAGE",
    ]);
  });

  it("answers [] for an action with no content guard, whatever ticketData says", () => {
    // Knowable without any data at all: the action references no pairs, so nothing can be missing.
    for (const ticketData of [undefined, {}, { POWER_RUN_OUT_DEVICE: [{ MARKED: false }] }]) {
      const body = decideTransition(request({ ticketData }));
      expect(body.requiredFields).toEqual([]);
      expect(body.unverifiedFields).toEqual([]);
      expect(body.outOfScopeGuards).toEqual(EVN_PCT_GUARDS.PCT_A_WORKING);
    }
  });
});

describe("ticketData shapes endpoint C cannot read (P4c)", () => {
  const allow = (ticketData: Record<string, unknown>) =>
    decideRaw(
      request({ actionCode: "PCT_A_ALLOW", currentStatusCode: "PCT_S_WORKING", ticketData }),
    );

  it("refuses to render a verdict from a shape neither side reads as rows", () => {
    // Including the flat scalar shape from EVN's OWN §12.C example. It is not accepted and cannot
    // be: `_.forEach` over a string iterates its CHARACTERS, so `valueItem[mark]` is undefined and
    // their own guard fails it. There is no reading of it that matches their behaviour, so this is
    // a 422 with an explanation rather than a guess. The handover doc retracts the promise to
    // "accept both shapes" on exactly this evidence.
    for (const value of ["Trạm 110kV Thủ Đức", 42, true, { MARKED: true }, { data: "not-rows" }]) {
      const decision = allow({ BARRIER_SIGNAGE: value });
      expect({ value, ok: decision.ok }).toEqual({ value, ok: false });
    }
  });

  it("names the item and the expected shape, and leaks nothing the caller sent", () => {
    const secret = "Trạm 110kV Thủ Đức";
    const decision = allow({ BARRIER_SIGNAGE: secret });
    if (decision.ok) throw new Error("expected an unusable payload");
    expect(decision.unusable).toEqual([
      {
        itemCode: "BARRIER_SIGNAGE",
        reason: "expected an array of rows, or an object with a `data` array",
      },
    ]);
    // A 422 body is the one place an integrator's ticket content could escape into our logs and
    // their client. It names shapes, never values.
    expect(JSON.stringify(decision)).not.toContain(secret);
  });

  it("still answers normally when the unreadable key belongs to a different action", () => {
    // `PCT_A_ALLOW` does not reference PARTICIPANTS_WORKSITE, so its shape is none of our business.
    // Scanning all of `ticketData` rather than only the referenced pairs would 422 the happy path.
    const decision = allow({
      ...completeContent("PCT_A_ALLOW"),
      PARTICIPANTS_WORKSITE: "nonsense",
    });
    expect(decision.ok).toBe(true);
  });
});

describe("evn-required-fields.ts — gates on the COMMITTED data", () => {
  // ⚠️ Twins of the gates in `measure-evn-required-fields.ts`. That script needs EVN's source, which
  // CI does not have, so a gate living only there fires only when someone chooses to regenerate.
  // These run on every push, against the bytes we actually ship.

  it("covers exactly the five actions ACTION_FINISH_CONTENT lists for PCT", () => {
    expect(Object.keys(EVN_PCT_REQUIRED_CONTENT).sort()).toEqual([
      "PCT_A_ALLOW",
      "PCT_A_ALLOW_HANDOVER",
      "PCT_A_CONFIRM_LOCK",
      "PCT_A_END",
      "PCT_A_HANDOVER",
    ]);
  });

  it("holds 13 pairs, and the right number per action", () => {
    // Per-action, not just the total: `PCT_A_HANDOVER` reading 6 is the specific failure to catch —
    // a sixth pair is COMMENTED OUT at `ticket.constant.ts:965-970` with a business note dropping
    // the photo requirement for item 2.5, and a comment-blind parser demands a photo EVN does not.
    // This gate caught exactly that during P4c: the shared `stripLineComments` helper was a no-op
    // on their CRLF sources.
    const counts = Object.fromEntries(
      Object.entries(EVN_PCT_REQUIRED_CONTENT).map(([action, pairs]) => [action, pairs.length]),
    );
    expect(counts).toEqual({
      PCT_A_ALLOW: 4,
      PCT_A_ALLOW_HANDOVER: 2,
      PCT_A_CONFIRM_LOCK: 1,
      PCT_A_END: 1,
      PCT_A_HANDOVER: 5,
    });
    expect(Object.values(EVN_PCT_REQUIRED_CONTENT).flat()).toHaveLength(13);
  });

  it("is OBJ with a non-empty mark throughout — the only branch the primitive models", () => {
    // A LIST pair fails in EVN when the list is empty (`ticket.service.ts:5472-5477`) exactly where
    // `none` passes, and a pair without a mark takes a third branch entirely (`:5487-5493`).
    for (const pair of Object.values(EVN_PCT_REQUIRED_CONTENT).flat()) {
      expect({ itemCode: pair.itemCode, type: pair.type, hasMark: pair.mark !== "" }).toEqual({
        itemCode: pair.itemCode,
        type: "OBJ",
        hasMark: true,
      });
    }
  });

  it("holds no item that takes EVN's two-level branch", () => {
    // `PROCEDURE_OPERATIONAL_TASKS` is checked at `value[].children[][mark]`
    // (`ticket.service.ts:5462-5470`); the flat primitive would silently check the wrong level.
    const codes = Object.values(EVN_PCT_REQUIRED_CONTENT)
      .flat()
      .map((pair) => pair.itemCode);
    expect(codes).not.toContain("PROCEDURE_OPERATIONAL_TASKS");
  });

  it("pins the item and mark codes as literals", () => {
    // Written out by hand rather than derived from the module: a list built from the file it is
    // checking is a tautology. These are enum VALUES — `formItemCodeEnum` spells them the same as
    // its member names today, but `TypeActionFinishContentEnum` does not (`obj = "OBJ"`), so member
    // and value genuinely do diverge in this table and cannot be assumed equal.
    const codes = [
      ...new Set(
        Object.values(EVN_PCT_REQUIRED_CONTENT)
          .flat()
          .flatMap((pair) => [pair.itemCode, pair.mark]),
      ),
    ].sort();
    expect(codes).toEqual([
      "BARRIER_SIGNAGE",
      "CHECKED_INTERGRATED_AND_EARTHING",
      "HANDOVER_POWER_RUN_OUT_DEVICE",
      "INTERGRATED_AND_EARTHING",
      "LOCATION_TO_EARTHING",
      "MARKED",
      "MARKED_IMAGE",
      "PARTICIPANTS_WORKSITE",
      "POWER_RUN_OUT_DEVICE",
      "WARNING_INSTRUCTIONS",
    ]);
  });

  it("stays in step with the actions evn-guards.ts marks CONTENT_FINISHED", () => {
    // Two generated files, two scripts, one EVN table. Regenerating only one would leave us either
    // dropping the guard for an action we no longer evaluate, or evaluating one we never listed.
    const guarded = Object.entries(EVN_PCT_GUARDS)
      .filter(([, guards]) => guards.includes("CONTENT_FINISHED"))
      .map(([action]) => action)
      .sort();
    expect(guarded).toEqual(Object.keys(EVN_PCT_REQUIRED_CONTENT).sort());
  });
});
