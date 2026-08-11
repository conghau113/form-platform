import { describe, expect, it } from "vitest";
import {
  EVN_PCT_TRANSITIONS,
  EVN_ROLE_WILDCARD,
  EVN_STATUS_NA,
  EVN_STATUS_SYNC,
} from "./evn-transitions.js";
import { lookupTransition } from "./transition-table.js";

describe("EVN PCT transition data", () => {
  it("keeps both sources of the table", () => {
    const flow = EVN_PCT_TRANSITIONS.filter((row) => row.source === "flow");
    const loop = EVN_PCT_TRANSITIONS.filter((row) => row.source === "loop");
    expect(flow).toHaveLength(34);
    expect(loop).toHaveLength(273);
  });

  it("uses R_NA as the wildcard role, not the status sentinel's spelling", () => {
    // `codeStatusEnum.sNa` is "S_N/A"; the role one is not, and copying the slash across breaks the
    // 124 wildcard rows silently. See the wildcard test in the lookup block below for the behaviour.
    expect(EVN_ROLE_WILDCARD).toBe("R_NA");
  });

  it("keeps every (status, action) on a single role", () => {
    // `lookupTransition` groups by (status, action) and only consults `roleCode` when the caller
    // supplied one. The generator asserts this too, but the generator needs EVN's source and cannot
    // run in CI — this is the copy that guards the table we actually ship.
    const roles = new Map<string, Set<string>>();
    for (const row of EVN_PCT_TRANSITIONS) {
      const key = `${row.statusCode}|${row.actionCode}`;
      roles.set(key, (roles.get(key) ?? new Set()).add(row.roleCode));
    }
    expect([...roles].filter(([, set]) => set.size > 1)).toEqual([]);
  });

  it("uses S_N/A as the no-change sentinel", () => {
    // A VALUE anchor, not a behaviour one, and deliberately so: no row spells `S_N/A` out, so
    // `nextStatusOf` compares the constant against itself and no behavioural test can go red if the
    // generator ever emits the wrong string here.
    expect(EVN_STATUS_NA).toBe("S_N/A");
  });

  it("keeps PCT_A_WORKING on the single row their source declares", () => {
    // EVN's own §12.C and §13 examples say this action leads to PCT_S_ALLOWED_WAITING from
    // PCT_S_CREATED. Their table says otherwise and the table wins — an integrator trying the
    // documented example first will report us as wrong, and we must not "fix" it to match the doc.
    const rows = EVN_PCT_TRANSITIONS.filter((row) => row.actionCode === "PCT_A_WORKING");
    expect(rows).toEqual([
      {
        roleCode: "PCT_R_CHTT",
        statusCode: "PCT_S_MODERATION",
        actionCode: "PCT_A_WORKING",
        statusCodeNext: "PCT_S_WORKING",
        source: "flow",
      },
    ]);
  });

  it("carries the halt transition, which only the generated source has", () => {
    const halt = EVN_PCT_TRANSITIONS.filter((row) => row.actionCode === "PCT_A_HALT");
    expect(halt.length).toBeGreaterThan(0);
    expect(halt.every((row) => row.source === "loop")).toBe(true);
    expect(halt.every((row) => row.statusCodeNext === "PCT_S_HALT")).toBe(true);
  });
});

describe("lookupTransition", () => {
  it("reports a status change", () => {
    expect(
      lookupTransition({ statusCode: "PCT_S_MODERATION", actionCode: "PCT_A_WORKING" }),
    ).toEqual({
      kind: "resolved",
      nextStatus: "PCT_S_WORKING",
      source: "flow",
    });
  });

  it("reports no change when the row omits the next status", () => {
    // PCT_A_DELETE declares no `statusCodeNext`, so the column default `S_N/A` applies.
    expect(lookupTransition({ statusCode: "PCT_S_DRAFT", actionCode: "PCT_A_DELETE" })).toEqual({
      kind: "resolved",
      nextStatus: null,
      source: "flow",
    });
  });

  it("reports no change when the row restates the current status", () => {
    // The other half of the same idea: PCT_A_NHANVIEN_CHECKIN names PCT_S_HANDOVERED while already
    // in it. `S_N/A` and "same status" are written differently and mean the same thing.
    expect(
      lookupTransition({ statusCode: "PCT_S_HANDOVERED", actionCode: "PCT_A_NHANVIEN_CHECKIN" }),
    ).toEqual({
      kind: "resolved",
      nextStatus: null,
      source: "flow",
    });
  });

  it("passes S_SYNC through as the table records it", () => {
    // Not one of the 16 PCT statuses — it belongs to the cross-type status table. We report what
    // their table says rather than quietly correcting it.
    expect(lookupTransition({ statusCode: "PCT_S_CREATED", actionCode: "SYNCHRONIZE" })).toEqual({
      kind: "resolved",
      nextStatus: EVN_STATUS_SYNC,
      source: "loop",
    });
  });

  it("distinguishes an unknown key from a role that cannot act", () => {
    expect(lookupTransition({ statusCode: "PCT_S_DRAFT", actionCode: "PCT_A_END" })).toEqual({
      kind: "not-found",
      roleMismatch: false,
    });
  });

  it("flags the executor's role when rows exist but none is theirs", () => {
    // PCT_A_ALLOW at PCT_S_WORKING belongs to PCT_R_CHO_PHEP. Without this filter the lookup would
    // answer as if any role could take it — and on this data almost nothing else exercises the filter.
    expect(
      lookupTransition({
        statusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        executorRoleCodes: ["PCT_R_NHAN_VIEN"],
      }),
    ).toEqual({ kind: "not-found", roleMismatch: true });
  });

  it("lets the role the row belongs to take it", () => {
    // The other half of the role filter, and the half that goes silently missing: with only the
    // wrong-role and wildcard tests above, deleting `executorRoleCodes.includes(...)` keeps every
    // test green while telling P4b that EVN would block the one person who may actually act.
    expect(
      lookupTransition({
        statusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        executorRoleCodes: ["PCT_R_CHO_PHEP"],
        ticketRoleCodes: [],
      }),
    ).toEqual({ kind: "resolved", nextStatus: "PCT_S_ALLOWED", source: "flow" });
  });

  it("lets any role take a wildcard row", () => {
    // The upload action is stored against R_NA, which applies to everyone; PCT_R_CREATED holds no
    // row of its own here. This is the test that goes red if the wildcard constant is misspelt.
    expect(
      lookupTransition({
        statusCode: "PCT_S_HANDOVERED",
        actionCode: "PCT_A_UPLOAD",
        executorRoleCodes: ["PCT_R_CREATED"],
      }),
    ).toEqual({ kind: "resolved", nextStatus: null, source: "loop" });
  });

  it("refuses to guess when two rows share a key and the ticket's roles are unknown", () => {
    expect(lookupTransition({ statusCode: "PCT_S_WORKING", actionCode: "PCT_A_ALLOW" })).toEqual({
      kind: "ambiguous",
      candidates: ["PCT_S_ALLOWED_WAITING", "PCT_S_ALLOWED"],
      needsTicketRole: "PCT_R_LANH_DAO",
    });
  });

  it("takes the waiting branch when the ticket carries the deciding role", () => {
    expect(
      lookupTransition({
        statusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        ticketRoleCodes: ["PCT_R_CHTT", "PCT_R_LANH_DAO"],
      }),
    ).toEqual({ kind: "resolved", nextStatus: "PCT_S_ALLOWED_WAITING", source: "flow" });
  });

  it("takes the direct branch when the ticket does not", () => {
    // `[]` is an answer — "we looked, there are none" — and must not be confused with not asking.
    expect(
      lookupTransition({
        statusCode: "PCT_S_WORKING",
        actionCode: "PCT_A_ALLOW",
        ticketRoleCodes: [],
      }),
    ).toEqual({ kind: "resolved", nextStatus: "PCT_S_ALLOWED", source: "flow" });
  });
});
