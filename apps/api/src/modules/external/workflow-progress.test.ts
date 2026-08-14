import { describe, expect, it } from "vitest";
import { EVN_PCT_WORKFLOW_NODES } from "./evn-workflow-nodes.js";
import { projectWorkflow } from "./workflow-progress.js";

/** Stored state in the shape EVN writes (`workflow.service.ts:1114-1118`). */
function stored(nodes: Record<string, unknown>): Record<string, unknown> {
  return { WORKFLOW_NODES: { data: nodes } };
}

/**
 * Gates on the COMMITTED table — twins of the ones inside `src/scripts/measure-evn-workflow.ts`.
 *
 * The script's assertions only run when someone deliberately regenerates, which needs EVN's source
 * tree and therefore never happens in CI. Anything the runtime depends on has to be re-asserted
 * here, against the data that actually shipped.
 */
describe("EVN_PCT_WORKFLOW_NODES — the committed table", () => {
  it("holds 15 nodes whose order is a permutation of 1..15", () => {
    expect(EVN_PCT_WORKFLOW_NODES).toHaveLength(15);
    expect(EVN_PCT_WORKFLOW_NODES.map((node) => node.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(new Set(EVN_PCT_WORKFLOW_NODES.map((node) => node.nodeCode)).size).toBe(15);
  });

  it("pins what closes each node, as hand-written literals", () => {
    // Written out by hand rather than derived from the module, for the reason the required-content
    // gate gives: a list built from the file it is checking is a tautology.
    //
    // ⚠️ Counting the three `complete` FORMS (12 ACTION_CODE / 2 ANY / 1 NODE) is not enough, and
    // that is the whole reason this test looks like this. Measured: rewriting all twelve
    // single-action nodes to `completedBy: ["WRONG"]` leaves that 12/2/1 distribution untouched —
    // every array is still one element long — and this assertion is what goes red for it.
    //
    // ⚠️ Measured too: a generator that derived `completedBy` by stripping `PCT_WORKFLOW_NODE__` off
    // the node code reproduces 12 of these 15 and goes red here on three — `STARTED` and `FINISHED`
    // are not action codes at all, and `PCT_A_CREATED` closes on a three-action list, not on its
    // namesake. The near-miss is the point: 12 right out of 15 is what makes it tempting.
    expect(
      EVN_PCT_WORKFLOW_NODES.map((node) => [
        node.nodeCode,
        node.completedByNode ?? node.completedBy,
      ]),
    ).toEqual([
      ["PCT_WORKFLOW_NODE__STARTED", ["PCT_A_CREATED", "PCT_A_UPDATE", "PCT_A_EDIT"]],
      ["PCT_WORKFLOW_NODE__PCT_A_CREATED", ["PCT_A_CREATED", "PCT_A_UPDATE", "PCT_A_EDIT"]],
      ["PCT_WORKFLOW_NODE__PCT_A_MODERATE_ALLOWER", ["PCT_A_MODERATE_ALLOWER"]],
      ["PCT_WORKFLOW_NODE__PCT_A_MODERATE_GSATD", ["PCT_A_MODERATE_GSATD"]],
      ["PCT_WORKFLOW_NODE__PCT_A_WORKING", ["PCT_A_WORKING"]],
      ["PCT_WORKFLOW_NODE__PCT_A_ALLOW", ["PCT_A_ALLOW"]],
      ["PCT_WORKFLOW_NODE__PCT_A_ALLOW_HANDOVER", ["PCT_A_ALLOW_HANDOVER"]],
      ["PCT_WORKFLOW_NODE__PCT_A_HANDOVER", ["PCT_A_HANDOVER"]],
      ["PCT_WORKFLOW_NODE__PCT_A_HANDOVER_APPROVED", ["PCT_A_HANDOVER_APPROVED"]],
      ["PCT_WORKFLOW_NODE__PCT_A_END", ["PCT_A_END"]],
      ["PCT_WORKFLOW_NODE__PCT_A_END_APPROVED", ["PCT_A_END_APPROVED"]],
      ["PCT_WORKFLOW_NODE__PCT_A_LOCK", ["PCT_A_LOCK"]],
      ["PCT_WORKFLOW_NODE__PCT_A_CONFIRM_LOCK", ["PCT_A_CONFIRM_LOCK"]],
      ["PCT_WORKFLOW_NODE__PCT_A_FINISHED", ["PCT_A_FINISHED"]],
      // Closes on a NODE, not an action — the one case `completedBy: []` alone could not express.
      ["PCT_WORKFLOW_NODE__FINISHED", "PCT_WORKFLOW_NODE__PCT_A_FINISHED"],
    ]);
  });

  it("uses `completedByNode` exactly where `completedBy` is empty", () => {
    // The invariant that makes `[]` readable: it never means "we failed to extract this".
    for (const node of EVN_PCT_WORKFLOW_NODES) {
      expect({
        nodeCode: node.nodeCode,
        empty: node.completedBy.length === 0,
      }).toEqual({ nodeCode: node.nodeCode, empty: node.completedByNode !== undefined });
    }
  });
});

describe("projectWorkflow — reading stored state", () => {
  it("copies EVN's three statuses through and names the absent ones itself", () => {
    const { progress, unverified } = projectWorkflow(
      stored({
        PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" },
        PCT_WORKFLOW_NODE__PCT_A_CREATED: { id: "2", status: "PROCESSING" },
        PCT_WORKFLOW_NODE__PCT_A_MODERATE_ALLOWER: { id: "3", status: "ADDED" },
      }),
    );

    expect(unverified).toEqual([]);
    expect(progress?.total).toBe(15);
    expect(progress?.completed).toBe(1);
    expect(progress?.nodes.slice(0, 4).map((node) => [node.nodeCode, node.state])).toEqual([
      ["PCT_WORKFLOW_NODE__STARTED", "COMPLETED"],
      ["PCT_WORKFLOW_NODE__PCT_A_CREATED", "PROCESSING"],
      ["PCT_WORKFLOW_NODE__PCT_A_MODERATE_ALLOWER", "ADDED"],
      // Ours, not theirs: EVN has no member for "this node is not in the map".
      ["PCT_WORKFLOW_NODE__PCT_A_MODERATE_GSATD", "NOT_REACHED"],
    ]);
  });

  it("reports every node of the definition, in flow order, not just the stored ones", () => {
    // An EMPTY map is a real projection, not an unreadable one — though NOT because EVN stores `{}`
    // (it never does: `saveWorkflowNodes` early-returns on an empty map, `workflow.service.ts`
    // `:1107-1109`). It is because their own readers spell it `?.value?.data || {}` (`:901`,
    // `:1131`), so a caller building `ticketData` that way sends `{}` for a ticket with no row.
    const { progress } = projectWorkflow(stored({}));
    expect(progress?.nodes.map((node) => node.order)).toEqual(
      EVN_PCT_WORKFLOW_NODES.map((node) => node.order),
    );
    expect(progress?.completed).toBe(0);
  });

  it("carries `completedByNode` through to the projected node, not just the definition", () => {
    // Measured: deleting the two `completedByNode` spreads in `projectWorkflow` left every other
    // test in this repo green, while the field T22 promises vanished from the wire. The gates above
    // only read the DEFINITION table, so nothing was watching the projection.
    const { progress } = projectWorkflow(stored({}));
    expect(progress?.nodes.at(-1)).toEqual({
      nodeCode: "PCT_WORKFLOW_NODE__FINISHED",
      order: 15,
      state: "NOT_REACHED",
      completedBy: [],
      completedByNode: "PCT_WORKFLOW_NODE__PCT_A_FINISHED",
    });
    // And absent — not `undefined` — on a node that closes on an action.
    expect(Object.hasOwn(progress?.nodes[0] ?? {}, "completedByNode")).toBe(false);
  });

  it("refuses a map whose keys are not node codes, instead of calling it a fresh ticket", () => {
    // 🔴 Measured fail-open, fixed here: every one of these projected `completed: 0` over 15
    // `NOT_REACHED` nodes with an EMPTY `unverified` — "we looked, this ticket has not moved" —
    // when the truth is we did not understand the payload at all.
    for (const [label, raw] of [
      ["whole ticket_items row", { id: 7, code: "WORKFLOW_NODES", value: { data: {} } }],
      ["`value` wrapper", { value: { data: {} } }],
      ["mistyped wrapper", { datas: {} }],
      ["garbage", { hello: "world" }],
      // Same family, and it survived the first version of the gate: the outer keys are not node
      // codes, but unwrapping an EMPTY `data` threw them away and reported 0 of 15.
      ["ticket_items row with an empty `data`", { id: 7, code: "WORKFLOW_NODES", data: {} }],
    ] as const) {
      expect({ label, result: projectWorkflow({ WORKFLOW_NODES: raw }) }).toEqual({
        label,
        result: {
          progress: null,
          unverified: [{ itemCode: "WORKFLOW_NODES", reason: "ITEM_UNREADABLE" }],
        },
      });
    }
  });

  it("refuses to unwrap `data` while the outer record also holds node codes", () => {
    // Unwrapping would silently discard the two real nodes sitting OUTSIDE the wrapper and answer
    // from the one inside — a projection built from half the evidence.
    //
    // ⚠️ The wrapper is deliberately NON-EMPTY. With `data: {}` the empty-wrapper gate catches this
    // first, which left this gate untested: measured, deleting it kept the suite green.
    const result = projectWorkflow({
      WORKFLOW_NODES: {
        data: { PCT_WORKFLOW_NODE__PCT_A_WORKING: { id: "3", status: "ADDED" } },
        PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" },
        PCT_WORKFLOW_NODE__PCT_A_CREATED: { id: "2", status: "COMPLETED" },
      },
    });
    expect(result.progress).toBeNull();
    expect(result.unverified).toEqual([{ itemCode: "WORKFLOW_NODES", reason: "ITEM_UNREADABLE" }]);
  });

  it("accepts the bare map as well as the `{ data }` wrapper", () => {
    // `rowsOf` accepts both shapes for the same payload; accepting one here and two there would be a
    // contract an integrator cannot guess.
    const nodes = { PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" } };
    expect(projectWorkflow({ WORKFLOW_NODES: nodes })).toEqual(projectWorkflow(stored(nodes)));
  });

  it("refuses to guess when a node is literally named `data`", () => {
    // Cannot happen with today's `PCT_WORKFLOW_NODE__*` codes. The gate exists so that the day it
    // can, the two shapes stop being distinguishable and we say so instead of picking one.
    //
    // ⚠️ The payload deliberately carries a REAL node beside the `data` key. The obvious version —
    // `{data: {data: {...}}}` — is caught by the all-unknown-keys gate instead, so it left the
    // `data` gate itself untested: measured, deleting that line kept the whole suite green.
    expect(
      projectWorkflow({
        WORKFLOW_NODES: {
          data: {
            PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" },
            data: { status: "ADDED" },
          },
        },
      }),
    ).toEqual({
      progress: null,
      unverified: [{ itemCode: "WORKFLOW_NODES", reason: "ITEM_UNREADABLE" }],
    });
  });

  it("collects nodes our definition does not know rather than failing", () => {
    const { progress, unverified } = projectWorkflow(
      stored({
        PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" },
        PCT_WORKFLOW_NODE__SOMETHING_NEW: { id: "9", status: "COMPLETED" },
      }),
    );
    // Definition drift is what `definitionVersion` exists to surface; refusing the whole projection
    // over it would be the wrong severity.
    expect(unverified).toEqual([]);
    expect(progress?.unknownNodes).toEqual(["PCT_WORKFLOW_NODE__SOMETHING_NEW"]);
    expect(progress?.completed).toBe(1);
  });

  it("draws the drift line at recognising NOTHING, and says so", () => {
    // One new node beside known ones is drift and projects fine (above). A map where NOT ONE key is
    // recognisable is a different claim: we cannot tell "EVN replaced the whole workflow" from "this
    // is not a node map", and the honest answer to both is that we could not read it.
    expect(
      projectWorkflow(stored({ SOMETHING_NEW: { id: "9", status: "COMPLETED" } })).unverified,
    ).toEqual([{ itemCode: "WORKFLOW_NODES", reason: "ITEM_UNREADABLE" }]);
  });
});

describe("projectWorkflow — what it refuses to invent", () => {
  it("returns null, never a zeroed projection, when it was not told", () => {
    // 🔴 The point of the whole field. `completed: 0` here would read as "we looked, this ticket has
    // not moved" — the strongest possible claim from the least knowledge, and the exact failure
    // `unverifiedFields` was invented for in P4c. Measured: making these cases fall through to a
    // real projection over an empty map turns this file AND `check-transition.test.ts` red — the
    // reply-shape gate over there sees it too, because `progress` stops being null on nine shapes.
    for (const [label, data] of [
      ["absent", undefined],
      ["null", null],
      ["no item", {}],
      ["item null", { WORKFLOW_NODES: null }],
    ] as const) {
      const result = projectWorkflow(data);
      expect({ label, progress: result.progress }).toEqual({ label, progress: null });
      expect(result.unverified).toHaveLength(1);
      expect(result.unverified[0]?.itemCode).toBe("WORKFLOW_NODES");
    }

    expect(projectWorkflow(undefined).unverified[0]?.reason).toBe("TICKET_DATA_ABSENT");
    // "You sent ticketData but not this item" and "you sent the item empty" are the same knowledge.
    expect(projectWorkflow({}).unverified[0]?.reason).toBe("ITEM_ABSENT");
    expect(projectWorkflow({ WORKFLOW_NODES: null }).unverified[0]?.reason).toBe("ITEM_ABSENT");
  });

  it("fails the WHOLE projection on one unreadable status, rather than calling it NOT_REACHED", () => {
    // Degrading would answer "has not got there yet" for something we could not read: a wrong answer
    // dressed as a real one, where null is merely an absent one.
    const result = projectWorkflow(
      stored({
        PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "COMPLETED" },
        PCT_WORKFLOW_NODE__PCT_A_CREATED: { id: "2", status: "HALF_DONE" },
      }),
    );
    expect(result.progress).toBeNull();
    expect(result.unverified).toEqual([
      { itemCode: "WORKFLOW_NODES", reason: "STATUS_NOT_MODELLED" },
    ]);
  });

  it("separates an unreadable NODE from an unreadable ITEM", () => {
    expect(projectWorkflow(stored({ PCT_WORKFLOW_NODE__STARTED: "COMPLETED" })).unverified).toEqual(
      [{ itemCode: "WORKFLOW_NODES", reason: "NODE_UNREADABLE" }],
    );
    for (const raw of [42, "text", [{ status: "ADDED" }]]) {
      expect(projectWorkflow({ WORKFLOW_NODES: raw }).unverified).toEqual([
        { itemCode: "WORKFLOW_NODES", reason: "ITEM_UNREADABLE" },
      ]);
    }
  });

  it("keeps `unverified` empty exactly when `progress` is not null", () => {
    // The two fields are one statement said twice; letting them disagree would let a caller read a
    // projection AND a reason it could not be made.
    for (const data of [
      undefined,
      {},
      { WORKFLOW_NODES: 42 },
      stored({}),
      stored({ PCT_WORKFLOW_NODE__STARTED: { id: "1", status: "ADDED" } }),
    ]) {
      const result = projectWorkflow(data);
      expect(result.unverified.length === 0).toBe(result.progress !== null);
    }
  });

  it("is driven by the table, not by anything hard-coded in the projection", () => {
    const { progress } = projectWorkflow(stored({ ONLY_NODE: { id: "1", status: "COMPLETED" } }), [
      { nodeCode: "ONLY_NODE", order: 1, completedBy: ["SOME_ACTION"] },
    ]);
    expect(progress).toEqual({
      nodes: [
        {
          nodeCode: "ONLY_NODE",
          order: 1,
          state: "COMPLETED",
          completedBy: ["SOME_ACTION"],
        },
      ],
      completed: 1,
      total: 1,
      unknownNodes: [],
    });
  });
});
