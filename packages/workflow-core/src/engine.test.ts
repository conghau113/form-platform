import {
  ROOT_SCOPE,
  type WorkflowDefinition,
  type WorkflowInstance,
  workflowInstanceSchema,
} from "@org/workflow-schema";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  type AdvanceContext,
  advance,
  availableTransitions,
  createInstance,
  validateGraph,
} from "./index.js";

// created --submit--> inprogress --approve(role:manager, guard:approved==true)--> done
const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "created",
  nodes: [
    { id: "created", status: "created" },
    { id: "inprogress", status: "inprogress" },
    { id: "done", status: "done" },
  ],
  transitions: [
    { id: "t1", from: "created", to: "inprogress", action: "submit" },
    {
      id: "t2",
      from: "inprogress",
      to: "done",
      action: "approve",
      role: "manager",
      guard: { rule: { "==": [{ var: "approved" }, true] } },
    },
  ],
};

describe("createInstance", () => {
  it("starts at the definition's start node and pins the version", () => {
    const inst = createInstance(def, { id: "case-1" });
    expect(inst.current).toBe("created");
    expect(inst.definitionId).toBe("wf");
    expect(inst.definitionVersion).toBe(1);
    expect(inst.history).toEqual([]);
  });

  it("generates distinct ids for cases started in the SAME millisecond", () => {
    // The clock is frozen so both calls see one timestamp — the case a store that writes by id
    // (the API upserts) used to collapse into a single overwritten case.
    vi.useFakeTimers();
    try {
      const a = createInstance(def);
      const b = createInstance(def);
      // Both ids carry the same frozen timestamp — proof the clock really did not move — yet differ.
      expect(a.id).toMatch(new RegExp(`^wf-${Date.now()}-`));
      expect(b.id).toMatch(new RegExp(`^wf-${Date.now()}-`));
      expect(a.id).not.toBe(b.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a caller-supplied id exactly as given", () => {
    expect(createInstance(def, { id: "case-1" }).id).toBe("case-1");
  });
});

describe("availableTransitions", () => {
  it("lists transitions leaving a state", () => {
    expect(availableTransitions(def, "created").map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("advance", () => {
  it("walks created -> inprogress -> done when guard and role are satisfied", () => {
    const i0 = createInstance(def, { id: "case-1" });

    const r1 = advance(def, i0, "submit");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.instance.current).toBe("inprogress");
    expect(r1.instance.history).toHaveLength(1);

    const r2 = advance(def, r1.instance, "approve", {
      roles: ["manager"],
      data: { approved: true },
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.instance.current).toBe("done");
    expect(r2.instance.history.map((h) => h.action)).toEqual(["submit", "approve"]);
    expect(r2.instance.data.approved).toBe(true);
  });

  it("blocks on a failing guard", () => {
    const inprogress = {
      ...createInstance(def),
      current: "inprogress",
      tokens: [{ id: "root-0", at: "inprogress", scope: "root" }],
    };
    const r = advance(def, inprogress, "approve", {
      roles: ["manager"],
      data: { approved: false },
    });
    expect(r).toEqual({ ok: false, reason: "guard-failed" });
  });

  it("blocks when the actor lacks the required role", () => {
    const inprogress = {
      ...createInstance(def),
      current: "inprogress",
      tokens: [{ id: "root-0", at: "inprogress", scope: "root" }],
    };
    const r = advance(def, inprogress, "approve", { roles: ["clerk"], data: { approved: true } });
    expect(r).toEqual({ ok: false, reason: "role-denied" });
  });

  it("reports no-transition for an unknown action", () => {
    const i0 = createInstance(def);
    expect(advance(def, i0, "nope")).toEqual({ ok: false, reason: "no-transition" });
  });

  it("reports unknown-state when current does not exist", () => {
    const broken = {
      ...createInstance(def),
      current: "ghost",
      tokens: [{ id: "root-0", at: "ghost", scope: "root" }],
    };
    expect(advance(def, broken, "submit")).toEqual({ ok: false, reason: "unknown-state" });
  });

  it("does not mutate the input instance", () => {
    const i0 = createInstance(def, { id: "case-1" });
    advance(def, i0, "submit");
    expect(i0.current).toBe("created");
    expect(i0.history).toHaveLength(0);
  });
});

describe("advance actor (Phase E)", () => {
  it("records the actor on the history entry when one is supplied", () => {
    const r = advance(def, createInstance(def), "submit", { actor: "usr_1" });
    if (!r.ok) throw new Error("expected the advance to succeed");
    expect(r.instance.history[0].actor).toBe("usr_1");
  });

  it("omits the key entirely when no actor is supplied", () => {
    const r = advance(def, createInstance(def), "submit");
    if (!r.ok) throw new Error("expected the advance to succeed");
    expect(r.instance.history[0]).not.toHaveProperty("actor");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E3a — multi-token: fork, join, token selection
// ─────────────────────────────────────────────────────────────────────────────

/** start --submit--> F(fork) ⇉ A, B --doneA/doneB--> J(join) --merge--> end */
const parallelDef: WorkflowDefinition = {
  workflowVersion: 1,
  id: "par",
  title: "Parallel",
  start: "start",
  nodes: [
    { id: "start", status: "start" },
    { id: "F", status: "fork", gateway: "fork" },
    { id: "A", status: "A" },
    { id: "B", status: "B" },
    { id: "J", status: "join", gateway: "join" },
    { id: "end", status: "end", kind: "end" },
  ],
  transitions: [
    { id: "t1", from: "start", to: "F", action: "submit" },
    { id: "fa", from: "F", to: "A", action: "enterA" },
    { id: "fb", from: "F", to: "B", action: "enterB" },
    { id: "ta", from: "A", to: "J", action: "doneA" },
    { id: "tb", from: "B", to: "J", action: "doneB" },
    { id: "tj", from: "J", to: "end", action: "merge" },
  ],
};

/** Advance and assert the result is a CONTRACT-VALID instance.
 *  `workflowInstanceSchema` is the only enforcement `tokens.min(1)` and the "no `root` key in
 *  `scopes`" refine ever get — the API stores a body as opaque JSON and never parses it back — so
 *  every success path in this file is checked against it rather than argued about. */
function step(
  def: WorkflowDefinition,
  inst: WorkflowInstance,
  action: string,
  ctx?: AdvanceContext,
): WorkflowInstance {
  const r = advance(def, inst, action, ctx);
  if (!r.ok) throw new Error(`expected the advance to succeed, got ${r.reason}`);
  expect(workflowInstanceSchema.safeParse(r.instance).success).toBe(true);
  const tokens = r.instance.tokens ?? [];
  // Ids only have to be unique WITHIN an instance, but they do have to be: two tokens sharing one
  // id is exactly the silent branch-merge the marking exists to prevent.
  expect(new Set(tokens.map((t) => t.id)).size).toBe(tokens.length);
  // Every non-root scope must be backed by a real fork run. An orphan reads as "outermost" to every
  // reader (see the `scopes` contract note), which is a lie no later reader can detect.
  for (const t of tokens) {
    if (t.scope !== "root") expect(r.instance.scopes?.[t.scope]).toBeDefined();
  }
  return r.instance;
}

const forked = () => step(parallelDef, createInstance(parallelDef, { id: "c" }), "submit");

describe("advance — fork (E3a)", () => {
  it("splits into one token per outgoing edge and records ONE fork run", () => {
    const inst = forked();
    expect(inst.tokens?.map((t) => t.at)).toEqual(["A", "B"]);
    const scopes = Object.entries(inst.scopes ?? {});
    expect(scopes).toHaveLength(1);
    expect(scopes[0][1]).toEqual({ forkNode: "F", expected: 2, parent: null });
    // Both branches belong to the SAME run — that is what the join will count.
    expect(inst.tokens?.[0].scope).toBe(scopes[0][0]);
    expect(inst.tokens?.[1].scope).toBe(scopes[0][0]);
  });

  it("writes history for the edges it traversed, tagged with the tokens it created", () => {
    const inst = forked();
    const auto = inst.history.filter((h) => h.from === "F");
    expect(auto.map((h) => h.action)).toEqual(["enterA", "enterB"]);
    expect(auto.map((h) => h.token)).toEqual(inst.tokens?.map((t) => t.id));
  });

  it("advances one branch without disturbing the other", () => {
    const inst = step(parallelDef, forked(), "doneA");
    expect(inst.tokens?.map((t) => t.at)).toEqual(["J", "B"]);
  });

  it("keeps two tokens when branches meet again on an ORDINARY node (no dedupe)", () => {
    const diamond: WorkflowDefinition = {
      ...parallelDef,
      nodes: parallelDef.nodes.map((n) => (n.id === "J" ? { id: "J", status: "meet" } : n)),
    };
    const inst = step(diamond, step(diamond, forked(), "doneA"), "doneB");
    expect(inst.tokens?.filter((t) => t.at === "J")).toHaveLength(2);
  });
});

describe("advance — join (E3a)", () => {
  it("parks the first branch instead of releasing the join", () => {
    const inst = step(parallelDef, forked(), "doneA");
    expect(inst.tokens?.some((t) => t.at === "end")).toBe(false);
    expect(Object.keys(inst.scopes ?? {})).toHaveLength(1);
  });

  it("releases exactly once when the last branch arrives, and retires the fork run", () => {
    const inst = step(parallelDef, step(parallelDef, forked(), "doneA"), "doneB");
    expect(inst.tokens).toHaveLength(1);
    expect(inst.tokens?.[0].at).toBe("end");
    expect(inst.tokens?.[0].scope).toBe("root");
    expect(inst.scopes).toEqual({});
    expect(inst.history.filter((h) => h.from === "J")).toHaveLength(1);
    expect(inst.current).toBe("end");
  });

  it("lets a ROOT-scoped token walk through a join it never forked into", () => {
    // A case stored before markings existed, standing ON the join. `readMarking` gives it a
    // root-scoped token, which belongs to no fork run and so has no siblings to wait for.
    //
    // The walk-through happens while SETTLING, before anything is fired — which is why the action
    // asserted here is one that only exists on the far side of the join. Left parked, `after` would
    // not be available at all and this would be `no-transition`.
    const afterJoin: WorkflowDefinition = {
      ...parallelDef,
      nodes: [...parallelDef.nodes, { id: "Z", status: "Z" }],
      transitions: [
        ...parallelDef.transitions.map((t) => (t.id === "tj" ? { ...t, to: "Z" } : t)),
        { id: "tz", from: "Z", to: "end", action: "after" },
      ],
    };
    const legacy: WorkflowInstance = {
      id: "old",
      definitionId: "par",
      definitionVersion: 1,
      current: "J",
      data: {},
      history: [],
    };
    const out = step(afterJoin, legacy, "after");
    expect(out.tokens?.map((t) => t.at)).toEqual(["end"]);
    // The synthesized token keeps its identity through the join: nothing merged, so nothing is new.
    expect(out.tokens?.[0].id).toBe("legacy-token");
  });

  it("REFUSES a token whose fork run is gone, instead of treating it as outermost", () => {
    // The dangerous twin of the test above: a scope reads as missing when a join already closed it.
    // Waving that through would let a straggler cross the join a second time and re-run everything
    // downstream, silently.
    const orphan: WorkflowInstance = {
      id: "orphan",
      definitionId: "par",
      definitionVersion: 1,
      current: "J",
      data: {},
      history: [],
      tokens: [{ id: "x", at: "J", scope: "s-deleted" }],
      scopes: {},
    };
    expect(advance(parallelDef, orphan, "merge")).toEqual({ ok: false, reason: "invalid-gateway" });
  });
});

describe("advance — loops and nesting (E3a)", () => {
  /** …J --next--> C, and C --again--> F, so the fork can be traversed twice. */
  const loopDef: WorkflowDefinition = {
    ...parallelDef,
    nodes: [...parallelDef.nodes, { id: "C", status: "C" }],
    transitions: [
      ...parallelDef.transitions.map((t) => (t.id === "tj" ? { ...t, to: "C" } : t)),
      { id: "again", from: "C", to: "F", action: "again" },
    ],
  };

  it("gives each traversal of a fork its OWN run, so the rounds never count toward each other", () => {
    const first = step(loopDef, createInstance(loopDef, { id: "l" }), "submit");
    const scope1 = Object.keys(first.scopes ?? {})[0];
    const atC = step(loopDef, step(loopDef, first, "doneA"), "doneB");
    // Round one is finished and its run retired before round two begins.
    expect(atC.scopes).toEqual({});

    const second = step(loopDef, atC, "again");
    const scope2 = Object.keys(second.scopes ?? {})[0];
    expect(scope2).not.toBe(scope1);
    // Exactly one live run: the second traversal did not resurrect or reuse the first.
    expect(Object.keys(second.scopes ?? {})).toHaveLength(1);
    expect(second.tokens?.every((t) => t.scope === scope2)).toBe(true);
  });

  it("settles an inner join without swallowing the outer fork's token", () => {
    // F1 ⇉ A, F2 ; F2 ⇉ C, D ; C,D -> J2 -> B ; A,B -> J1 -> end
    const nested: WorkflowDefinition = {
      workflowVersion: 1,
      id: "nest",
      title: "Nested",
      start: "s",
      nodes: [
        { id: "s", status: "s" },
        { id: "F1", status: "F1", gateway: "fork" },
        { id: "F2", status: "F2", gateway: "fork" },
        { id: "A", status: "A" },
        { id: "C", status: "C" },
        { id: "D", status: "D" },
        { id: "J2", status: "J2", gateway: "join" },
        { id: "B", status: "B" },
        { id: "J1", status: "J1", gateway: "join" },
        { id: "end", status: "end", kind: "end" },
      ],
      transitions: [
        { id: "x0", from: "s", to: "F1", action: "go" },
        { id: "x1", from: "F1", to: "A", action: "toA" },
        { id: "x2", from: "F1", to: "F2", action: "toF2" },
        { id: "x3", from: "F2", to: "C", action: "toC" },
        { id: "x4", from: "F2", to: "D", action: "toD" },
        { id: "x5", from: "C", to: "J2", action: "doneC" },
        { id: "x6", from: "D", to: "J2", action: "doneD" },
        { id: "x7", from: "J2", to: "B", action: "inner" },
        { id: "x8", from: "A", to: "J1", action: "doneA" },
        { id: "x9", from: "B", to: "J1", action: "doneB" },
        { id: "xa", from: "J1", to: "end", action: "outer" },
      ],
    };

    // One advance walks BOTH forks: F1 spawns a token onto F2, which is itself a gateway.
    const open = step(nested, createInstance(nested, { id: "n" }), "go");
    expect(open.tokens?.map((t) => t.at)).toEqual(["A", "C", "D"]);
    const outerScope = open.tokens?.[0].scope as string;
    const innerScope = open.tokens?.[1].scope as string;
    expect(innerScope).not.toBe(outerScope);
    // The scope TREE is what keeps the two rounds apart.
    expect(open.scopes?.[innerScope].parent).toBe(outerScope);
    expect(open.scopes?.[outerScope].parent).toBeNull();

    const merged = step(nested, step(nested, open, "doneC"), "doneD");
    // The inner join consumed C and D only — A is untouched, and still on the OUTER run.
    expect(merged.tokens?.map((t) => t.at)).toEqual(["A", "B"]);
    expect(merged.tokens?.every((t) => t.scope === outerScope)).toBe(true);
    expect(merged.scopes?.[innerScope]).toBeUndefined();

    const done = step(nested, step(nested, merged, "doneA"), "doneB");
    expect(done.tokens?.map((t) => t.at)).toEqual(["end"]);
    expect(done.scopes).toEqual({});
  });
});

describe("advance — choosing a token (E3a)", () => {
  /** Both branches offer the SAME action — the textbook fork: two people approving in parallel. */
  const sameAction: WorkflowDefinition = {
    ...parallelDef,
    transitions: parallelDef.transitions.map((t) =>
      t.id === "ta" || t.id === "tb" ? { ...t, action: "approve" } : t,
    ),
  };
  const open = () => step(sameAction, createInstance(sameAction, { id: "s" }), "submit");

  it("refuses to guess when two tokens could both fire the action", () => {
    expect(advance(sameAction, open(), "approve")).toEqual({
      ok: false,
      reason: "ambiguous-token",
    });
  });

  it("moves the named token, and only that one", () => {
    const inst = open();
    const second = inst.tokens?.[1].id as string;
    const out = step(sameAction, inst, "approve", { token: second });
    expect(out.tokens?.map((t) => t.at)).toEqual(["A", "J"]);
    expect(out.history.at(-1)?.token).toBe(second);
  });

  it("refuses a token that is not in the live marking", () => {
    // Security: were the id trusted as a position, anyone able to run the case could fire a
    // transition from any node in the graph, stepping past the guards attached to where it is.
    expect(advance(sameAction, open(), "approve", { token: "made-up" })).toEqual({
      ok: false,
      reason: "unknown-token",
    });
  });

  it("still moves when only ONE of the candidate tokens passes its guard", () => {
    const guarded: WorkflowDefinition = {
      ...sameAction,
      transitions: sameAction.transitions.map((t) =>
        t.id === "tb" ? { ...t, guard: { rule: { "==": [{ var: "bReady" }, true] } } } : t,
      ),
    };
    const inst = step(guarded, createInstance(guarded, { id: "g" }), "submit");
    const out = step(guarded, inst, "approve", { data: { bReady: false } });
    expect(out.tokens?.map((t) => t.at)).toEqual(["J", "B"]);
  });
});

describe("advance — refusing a gateway it cannot execute (E3a)", () => {
  const badDef = (
    nodes: WorkflowDefinition["nodes"],
    transitions: WorkflowDefinition["transitions"],
  ): WorkflowDefinition => ({
    workflowVersion: 1,
    id: "bad",
    title: "Bad",
    start: "s",
    nodes,
    transitions,
  });

  const fire = (def: WorkflowDefinition) => advance(def, createInstance(def, { id: "b" }), "go");

  // Named rather than inlined into each `it` so the E4 twin test at the bottom can run the SAME
  // graphs through `validateGraph`. Copying them there instead would let the pairing the twin test
  // exists to protect drift apart inside the very test meant to pin it.
  const forkOneOut = badDef(
    [
      { id: "s", status: "s" },
      { id: "F", status: "F", gateway: "fork" },
      { id: "A", status: "A" },
    ],
    [
      { id: "t0", from: "s", to: "F", action: "go" },
      { id: "t1", from: "F", to: "A", action: "only" },
    ],
  );

  const joinTwoOut = badDef(
    [
      { id: "s", status: "s" },
      { id: "J", status: "J", gateway: "join" },
      { id: "A", status: "A" },
      { id: "B", status: "B" },
    ],
    [
      { id: "t0", from: "s", to: "J", action: "go" },
      { id: "t1", from: "J", to: "A", action: "a" },
      { id: "t2", from: "J", to: "B", action: "b" },
    ],
  );

  const forkGated = (extra: Partial<WorkflowDefinition["transitions"][number]>) =>
    badDef(
      [
        { id: "s", status: "s" },
        { id: "F", status: "F", gateway: "fork" },
        { id: "A", status: "A" },
        { id: "B", status: "B" },
      ],
      [
        { id: "t0", from: "s", to: "F", action: "go" },
        { id: "t1", from: "F", to: "A", action: "a", ...extra },
        { id: "t2", from: "F", to: "B", action: "b" },
      ],
    );

  const joinGated = (extra: Partial<WorkflowDefinition["transitions"][number]>) =>
    badDef(
      [
        { id: "s", status: "s" },
        { id: "J", status: "J", gateway: "join" },
        { id: "A", status: "A" },
      ],
      [
        { id: "t0", from: "s", to: "J", action: "go" },
        { id: "t1", from: "J", to: "A", action: "out", ...extra },
      ],
    );

  const forkCycle = badDef(
    [
      { id: "s", status: "s" },
      { id: "F", status: "F", gateway: "fork" },
      { id: "G", status: "G", gateway: "fork" },
      { id: "Z", status: "Z" },
      { id: "W", status: "W" },
    ],
    [
      { id: "t0", from: "s", to: "F", action: "go" },
      { id: "t1", from: "F", to: "G", action: "a" },
      { id: "t2", from: "F", to: "Z", action: "b" },
      { id: "t3", from: "G", to: "F", action: "c" },
      { id: "t4", from: "G", to: "W", action: "d" },
    ],
  );

  it("refuses a fork with a single outgoing edge", () => {
    expect(fire(forkOneOut)).toEqual({ ok: false, reason: "invalid-gateway" });
  });

  it("refuses a join that does not have exactly one way out", () => {
    expect(fire(joinTwoOut)).toEqual({ ok: false, reason: "invalid-gateway" });
  });

  it.each([
    ["role", { role: "manager" }],
    ["guard", { guard: { rule: { "==": [1, 1] } } }],
  ])("refuses a fork whose outgoing edge carries a %s", (_label, extra) => {
    // The engine takes EVERY edge out of a fork, so such a gate would stop nobody. Running the graph
    // anyway would quietly disarm a restriction its author believed was in force.
    expect(fire(forkGated(extra))).toEqual({ ok: false, reason: "invalid-gateway" });
  });

  it.each([
    ["role", { role: "manager" }],
    ["guard", { guard: { rule: { "==": [1, 1] } } }],
  ])("refuses a join whose single outgoing edge carries a %s (E4)", (_label, extra) => {
    // Symmetric with the fork case above: the engine follows a join's way out the moment its last
    // sibling arrives, without consulting either. Before E4 this restriction was evaluated on
    // exactly one path — a person firing the join by hand — and that path is the defect E4 removes.
    expect(fire(joinGated(extra))).toEqual({ ok: false, reason: "invalid-gateway" });
  });

  it("gives up on a fork cycle instead of looping forever", () => {
    expect(fire(forkCycle)).toEqual({ ok: false, reason: "gateway-overflow" });
  });

  // E4 — `engine.ts` says the static rules and these runtime refusals are "two views of one rule set
  // and must be kept in step", but nothing enforced it: each side had its own tests, so either could
  // be edited alone and the suite would stay green. This table IS the pairing.
  it.each([
    ["fork with one way out", forkOneOut, "invalid-gateway", ["fork-single-outgoing"]],
    ["join without exactly one way out", joinTwoOut, "invalid-gateway", ["join-not-one-outgoing"]],
    ["fork edge carrying a role", forkGated({ role: "manager" }), "invalid-gateway", ["fork-edge-gated"]],
    [
      "fork edge carrying a guard",
      forkGated({ guard: { rule: { "==": [1, 1] } } }),
      "invalid-gateway",
      ["fork-edge-gated"],
    ],
    ["join edge carrying a role", joinGated({ role: "manager" }), "invalid-gateway", ["join-edge-gated"]],
    [
      "join edge carrying a guard",
      joinGated({ guard: { rule: { "==": [1, 1] } } }),
      "invalid-gateway",
      ["join-edge-gated"],
    ],
    // The one case where the two rule sets legitimately DISAGREE. A fork cycle is refused at run
    // time, but statically it is an ordinary loop — and loops are a supported feature, so no static
    // rule may forbid it. Pinned so a later reader does not "fix the drift" by adding one.
    ["fork cycle", forkCycle, "gateway-overflow", []],
  ])("static rule matches the runtime refusal for a %s", (_label, graph, reason, codes) => {
    expect(fire(graph)).toEqual({ ok: false, reason });
    // Exact equality, not `.some()`: each of these graphs satisfies all four pre-E4 rules, so the
    // new code is the ONLY thing `validateGraph` may report.
    expect(validateGraph(graph).map((e) => e.code)).toEqual(codes);
  });

  it("has a static twin for every runtime gateway refusal but the one that cannot have one", () => {
    // The table above is a SAMPLE: adding a fifth `invalid-gateway` return to `settle` later would
    // get no static twin and nothing would go red. Source-pinned instead, because the invariant
    // ("two views of one rule set") has no runtime surface of its own to assert against.
    const source = readFileSync(new URL("./engine.ts", import.meta.url), "utf8");
    // Anchored on `return`, not on the reason alone: the union that DECLARES the reason mentions it
    // too, and counting that made this assertion off by one the first time it ran. It matches ONE
    // exact rendering, so a refusal written differently (`"invalid-gateway" as const`, say) would
    // slip past it — this counts, it does not pair; the table above does the pairing.
    const refusals = source.match(/return \{ ok: false, reason: "invalid-gateway" \}/g) ?? [];
    // Four with a twin (fork <2 out, gated fork edge, join !=1 out, gated join edge) + the missing
    // fork run, which is a property of a running case and cannot be read off a definition.
    expect(refusals).toHaveLength(5);
  });

  it("reports unknown-state — not a crash — for a token on a node the definition lost", () => {
    // Settling runs BEFORE the move, on a graph full of gateways; reading `.gateway` off a node that
    // is no longer there would throw, turning a case that merely outlived an edit into a 500.
    const stale: WorkflowInstance = {
      id: "stale",
      definitionId: "par",
      definitionVersion: 1,
      current: "vanished",
      data: {},
      history: [],
      tokens: [{ id: "x", at: "vanished", scope: "root" }],
      scopes: {},
    };
    expect(advance(parallelDef, stale, "merge")).toEqual({ ok: false, reason: "unknown-state" });
  });
});

describe("advance — marking bookkeeping (E3a)", () => {
  it("settles a case whose START is a fork, before anyone can act", () => {
    const startsForked: WorkflowDefinition = { ...parallelDef, start: "F" };
    const inst = createInstance(startsForked, { id: "sf" });
    expect(inst.tokens?.map((t) => t.at)).toEqual(["F"]);
    const out = step(startsForked, inst, "doneA");
    // Assert the marking, not merely that the advance succeeded. `doneA` is only reachable once the
    // fork has run, so an engine that settled solely after the move would report `no-transition`
    // here — and an engine that walked the fork's `enterA` edge as if it were an ordinary
    // transition would succeed with one token and no fork run to show for it.
    expect(out.tokens?.map((t) => t.at)).toEqual(["J", "B"]);
    expect(Object.keys(out.scopes ?? {})).toHaveLength(1);
    // History is chronological, so the steps the engine took to make the action POSSIBLE come
    // before it. Append them after and the record claims the case left A before it entered it —
    // and `nodeProgress` reads "the last departure from this node", which is order-sensitive.
    expect(out.history.map((h) => h.action)).toEqual(["enterA", "enterB", "doneA"]);
  });

  it("changes nothing when asked to settle an already-settled marking", () => {
    const once = forked();
    const twice = step(parallelDef, once, "doneA");
    // Re-forking would show up as a second run and two more traversal entries; neither appears.
    expect(Object.keys(twice.scopes ?? {})).toEqual(Object.keys(once.scopes ?? {}));
    expect(twice.history.filter((h) => h.from === "F")).toHaveLength(2);
  });

  it("keeps token order stable: a survivor holds its place", () => {
    const inst = step(parallelDef, forked(), "doneA");
    // The moved token stays FIRST — `current` is read off tokens[0], so a case must not appear to
    // jump because the engine appended instead of replacing.
    expect(inst.tokens?.map((t) => t.at)).toEqual(["J", "B"]);
    expect(inst.current).toBe("J");
  });

  it("believes `tokens` over a `current` that disagrees with it", () => {
    const skewed: WorkflowInstance = { ...forked(), current: "start" };
    const out = step(parallelDef, skewed, "doneA");
    expect(out.tokens?.map((t) => t.at)).toEqual(["J", "B"]);
  });

  it("does not mutate the instance it was given", () => {
    const inst = forked();
    const tokens = JSON.stringify(inst.tokens);
    const scopes = JSON.stringify(inst.scopes);
    const history = inst.history.length;
    step(parallelDef, inst, "doneA");
    expect(JSON.stringify(inst.tokens)).toBe(tokens);
    expect(JSON.stringify(inst.scopes)).toBe(scopes);
    expect(inst.history).toHaveLength(history);
  });
});

describe("advance — two fork runs waiting at the SAME join (E3a)", () => {
  // F1 ⇉ A, B ; A --split--> F2 ⇉ C, D ; B, C, D all lead to the SAME join J --merge--> Z.
  //
  // This is the only shape that can tell "count the tokens of MY run parked here" apart from "count
  // the tokens parked here". Every other parallel case in this file has one run at a join at a time,
  // so both rules agree and neither is being tested — which is exactly what the mutation probe
  // showed, and why this fixture exists.
  const shared: WorkflowDefinition = {
    workflowVersion: 1,
    id: "shared",
    title: "Shared join",
    start: "s",
    nodes: [
      { id: "s", status: "s" },
      { id: "F1", status: "F1", gateway: "fork" },
      { id: "A", status: "A" },
      { id: "B", status: "B" },
      { id: "F2", status: "F2", gateway: "fork" },
      { id: "C", status: "C" },
      { id: "D", status: "D" },
      { id: "J", status: "J", gateway: "join" },
      { id: "Z", status: "Z" },
    ],
    transitions: [
      { id: "g0", from: "s", to: "F1", action: "go" },
      { id: "g1", from: "F1", to: "A", action: "toA" },
      { id: "g2", from: "F1", to: "B", action: "toB" },
      { id: "g3", from: "A", to: "F2", action: "split" },
      { id: "g4", from: "F2", to: "C", action: "toC" },
      { id: "g5", from: "F2", to: "D", action: "toD" },
      { id: "g6", from: "B", to: "J", action: "bDone" },
      { id: "g7", from: "C", to: "J", action: "cDone" },
      { id: "g8", from: "D", to: "J", action: "dDone" },
      { id: "g9", from: "J", to: "Z", action: "merge" },
    ],
  };

  it("counts only its OWN run's arrivals, so a foreign token cannot complete a join", () => {
    const open = step(shared, createInstance(shared, { id: "sh" }), "go");
    const outer = open.tokens?.[0].scope as string;
    const split = step(shared, open, "split");
    const inner = split.tokens?.[0].scope as string;
    expect(inner).not.toBe(outer);

    // One token of the OUTER run is now parked on J, waiting for a sibling that has not arrived.
    const bAtJoin = step(shared, split, "bDone");
    expect(bAtJoin.tokens?.filter((t) => t.at === "J")).toHaveLength(1);

    // …and now one token of the INNER run parks on the very same node. Two tokens sit on J, and the
    // inner run's `expected` is 2 — so a join that counted the NODE would see 2 arrivals, release,
    // and drag the outer run's token through a join it was still waiting at.
    const cAtJoin = step(shared, bAtJoin, "cDone");
    expect(cAtJoin.tokens?.filter((t) => t.at === "J")).toHaveLength(2);
    expect(cAtJoin.tokens?.some((t) => t.at === "Z")).toBe(false);
    expect(Object.keys(cAtJoin.scopes ?? {}).sort()).toEqual([inner, outer].sort());

    // The inner run completes on its OWN second arrival, and takes only its own tokens with it.
    const released = step(shared, cAtJoin, "dDone");
    // Order, not just counts: the released token takes the place of the first sibling it consumed,
    // which here is AHEAD of the outer run's token still parked on the join. Appending instead would
    // put the waiting branch at the head — and `current` is read off the head.
    expect(released.tokens?.map((t) => t.at)).toEqual(["Z", "J"]);
    expect(released.current).toBe("Z");
    expect(released.scopes?.[inner]).toBeUndefined();
    expect(released.scopes?.[outer]).toBeDefined();
  });
});

describe("advance — which failure a multi-token case reports (E3a)", () => {
  // Every OTHER failure test in this file has a single token, so exactly one observation is ever
  // recorded and ANY permutation of the four checks would pass. These are the cases the ordering was
  // actually written for — reversing it is green without them.
  const forkedOn = (d: WorkflowDefinition) => step(d, createInstance(d, { id: "c" }), "submit");
  const twoWay: WorkflowDefinition = {
    ...parallelDef,
    transitions: parallelDef.transitions.map((t) => {
      if (t.id === "ta") return { ...t, action: "finish", role: "manager" };
      if (t.id === "tb")
        return { ...t, action: "finish", guard: { rule: { "==": [{ var: "ready" }, true] } } };
      return t;
    }),
  };

  it("prefers role-denied over guard-failed when two tokens hit different walls", () => {
    // The token on A is refused for lack of the role; the token on B is refused by its guard.
    expect(
      advance(twoWay, forkedOn(twoWay), "finish", { roles: [], data: { ready: false } }),
    ).toEqual({ ok: false, reason: "role-denied" });
  });

  it("prefers a real refusal over a token stranded on a node the definition lost", () => {
    // `unknown-state` sits BELOW the refusals on purpose: one token left behind by an edited
    // definition must not mask why the branch someone is actually working in was refused — for
    // every action, until somebody fixes the graph.
    const stranded: WorkflowInstance = {
      ...forkedOn(twoWay),
      tokens: [
        { id: "ghost-token", at: "vanished", scope: "root" },
        { id: "live-token", at: "B", scope: "root" },
      ],
      scopes: {},
    };
    expect(advance(twoWay, stranded, "finish", { data: { ready: false } })).toEqual({
      ok: false,
      reason: "guard-failed",
    });
  });

  it("still reports unknown-state when the stranded token is the only thing to report", () => {
    const onlyGhost: WorkflowInstance = {
      ...forkedOn(twoWay),
      tokens: [{ id: "ghost-token", at: "vanished", scope: "root" }],
      scopes: {},
    };
    expect(advance(twoWay, onlyGhost, "finish")).toEqual({ ok: false, reason: "unknown-state" });
  });
});

describe("advance — what the engine's own steps record (E3a)", () => {
  it("attributes a gateway traversal to whoever fired the advance that caused it", () => {
    // The engine walks a fork's edges by itself, but not on its own initiative — somebody's action
    // put the token there. Without the actor, history cannot answer "who forked this case".
    const inst = step(parallelDef, createInstance(parallelDef, { id: "a" }), "submit", {
      actor: "usr_7",
    });
    const auto = inst.history.filter((h) => h.from === "F");
    expect(auto).toHaveLength(2);
    expect(auto.every((h) => h.actor === "usr_7")).toBe(true);
  });

  it("omits the actor on gateway steps when the advance had none", () => {
    const inst = forked();
    for (const h of inst.history.filter((e) => e.from === "F")) {
      expect(h).not.toHaveProperty("actor");
    }
  });

  it("names the released token after the fork run it closes", () => {
    const open = forked();
    const scope = Object.keys(open.scopes ?? {})[0];
    const done = step(parallelDef, step(parallelDef, open, "doneA"), "doneB");
    // Derived from the scope, not minted fresh: only one join can ever close a given run, so this is
    // unique within the case AND says at a glance where the token came from.
    expect(done.tokens?.[0].id).toBe(`${scope}-j`);
    expect(done.history.at(-1)?.token).toBe(`${scope}-j`);
  });

  it("lands a fork's children exactly where their parent token stood", () => {
    // Order is a rule, not an accident: `current` is read off the head of `tokens`, so a fork that
    // appended instead of replacing would make an unrelated branch look like where the case is.
    const shared: WorkflowDefinition = {
      ...parallelDef,
      nodes: [
        ...parallelDef.nodes,
        { id: "G", status: "G", gateway: "fork" },
        { id: "P", status: "P" },
        { id: "Q", status: "Q" },
      ],
      transitions: [
        ...parallelDef.transitions,
        { id: "ag", from: "A", to: "G", action: "split" },
        { id: "gp", from: "G", to: "P", action: "toP" },
        { id: "gq", from: "G", to: "Q", action: "toQ" },
      ],
    };
    // Before: [A, B]. Splitting A must give [P, Q, B] — not [B, P, Q].
    const out = step(shared, step(shared, createInstance(shared, { id: "sp" }), "submit"), "split");
    expect(out.tokens?.map((t) => t.at)).toEqual(["P", "Q", "B"]);
    expect(out.current).toBe("P");
  });
});

describe("advance — settling does not lose or strand tokens (E3a)", () => {
  it("walks ONE root token through a join without consuming the others parked there", () => {
    // Root-scoped tokens on a join are unrelated arrivals, not siblings of one fork run: there is
    // nothing to merge. Consuming every one of them while emitting a single replacement would
    // delete branches — quietly, and with a contract-valid instance to show for it.
    // The action asked about lives BEYOND the join, because walking through happens while settling:
    // ask about the join's own edge and it has already been taken.
    const beyond: WorkflowDefinition = {
      ...parallelDef,
      nodes: [...parallelDef.nodes, { id: "Z", status: "Z" }],
      transitions: [
        ...parallelDef.transitions.map((t) => (t.id === "tj" ? { ...t, to: "Z" } : t)),
        { id: "tz", from: "Z", to: "end", action: "after" },
      ],
    };
    const twoRoot: WorkflowInstance = {
      id: "two-root",
      definitionId: "par",
      definitionVersion: 1,
      current: "J",
      data: {},
      history: [],
      tokens: [
        { id: "r1", at: "J", scope: "root" },
        { id: "r2", at: "J", scope: "root" },
      ],
      scopes: {},
    };
    // Both walk through to Z, so both are still there to be ambiguous about. A version that
    // swallowed one would leave a single token and report a perfectly ordinary success.
    expect(advance(beyond, twoRoot, "after")).toEqual({ ok: false, reason: "ambiguous-token" });
  });

  it("keeps settling the rest of the marking when one join is still waiting", () => {
    // The waiting join is scanned FIRST here. Aborting the sweep at it instead of skipping past it
    // strands the fork behind it on a gateway forever — and because the waiting token keeps its
    // place at the head, every later advance aborts at the same spot. No error, no way out.
    const late: WorkflowDefinition = {
      workflowVersion: 1,
      id: "late",
      title: "Late join",
      start: "s",
      nodes: [
        { id: "s", status: "s" },
        { id: "F", status: "F", gateway: "fork" },
        { id: "A", status: "A" },
        { id: "B", status: "B" },
        { id: "J", status: "J", gateway: "join" },
        { id: "F2", status: "F2", gateway: "fork" },
        { id: "P", status: "P" },
        { id: "Q", status: "Q" },
        { id: "Z", status: "Z" },
      ],
      transitions: [
        { id: "l0", from: "s", to: "F", action: "go" },
        { id: "l1", from: "F", to: "A", action: "toA" },
        { id: "l2", from: "F", to: "B", action: "toB" },
        { id: "l3", from: "A", to: "J", action: "aDone" },
        { id: "l4", from: "J", to: "Z", action: "merge" },
        { id: "l5", from: "B", to: "F2", action: "split" },
        { id: "l6", from: "F2", to: "P", action: "toP" },
        { id: "l7", from: "F2", to: "Q", action: "toQ" },
      ],
    };
    const open = step(late, createInstance(late, { id: "lt" }), "go");
    const waiting = step(late, open, "aDone");
    expect(waiting.tokens?.map((t) => t.at)).toEqual(["J", "B"]);

    const after = step(late, waiting, "split");
    // The inner fork ran even though the join ahead of it in the array is still short a sibling.
    expect(after.tokens?.map((t) => t.at)).toEqual(["J", "P", "Q"]);
  });

  it("moves the token that fired, not every token standing on the same node", () => {
    // Two branches can legitimately meet on an ordinary node. Matching by POSITION instead of by
    // token id advances both at once — the silent branch merge the whole marking exists to prevent.
    const meet: WorkflowDefinition = {
      ...parallelDef,
      nodes: parallelDef.nodes.map((n) => (n.id === "J" ? { id: "J", status: "meet" } : n)),
    };
    const both = step(meet, step(meet, forked(), "doneA"), "doneB");
    expect(both.tokens?.filter((t) => t.at === "J")).toHaveLength(2);

    const first = both.tokens?.[0].id as string;
    const out = step(meet, both, "merge", { token: first });
    expect(out.tokens?.map((t) => t.at)).toEqual(["end", "J"]);
  });
});

describe("advance — a gateway is never fired by hand (E4)", () => {
  /** parallelDef, one branch done: a token waiting at `J`, its sibling still at `B`. */
  const waiting = () => step(parallelDef, forked(), "doneA");

  it("refuses the join's own way out while a sibling has not arrived", () => {
    const inst = waiting();
    expect(inst.tokens?.map((t) => t.at)).toEqual(["J", "B"]);
    expect(advance(parallelDef, inst, "merge")).toEqual({
      ok: false,
      reason: "waiting-on-join",
    });
  });

  it("still lets the join release itself once the last sibling arrives", () => {
    // The point of the refusal is "not yet", not "never" — if this goes red, E4 broke parallel flow
    // rather than protecting it.
    const done = step(parallelDef, waiting(), "doneB");
    expect(done.tokens?.map((t) => t.at)).toEqual(["end"]);
  });

  it("does not blame the join for an action nobody could fire anywhere", () => {
    // `waiting-on-join` is qualified by the action. Without that, a case with any branch parked at a
    // join would answer "waiting for a sibling" to every typo, for every branch.
    expect(advance(parallelDef, waiting(), "no-such-action")).toEqual({
      ok: false,
      reason: "no-transition",
    });
  });

  it("refuses a gated join on ARRIVAL, not once its last sibling shows up", () => {
    // Placement pin. The gate check sits ABOVE the sibling count on purpose; moved below it, this
    // advance would SUCCEED — the branch would simply park at `J` and the case would answer
    // `waiting-on-join` instead. Every OTHER gated-join test stays green under either placement,
    // because they all reach the join root-scoped (`expected` 1, so the count never blocks), which
    // is exactly why this one uses a real fork run.
    const gatedJoin: WorkflowDefinition = {
      ...parallelDef,
      transitions: parallelDef.transitions.map((t) =>
        t.id === "tj" ? { ...t, role: "manager" } : t,
      ),
    };
    expect(advance(gatedJoin, forked(), "doneA")).toEqual({
      ok: false,
      reason: "invalid-gateway",
    });
  });

  it("reports the waiting branch, not a token the definition lost", () => {
    // Precedence: `waiting-on-join` outranks `unknown-state`. A branch waiting at a join is an
    // ordinary live position somebody is working in; `unknown-state` is a ghost left by an edit. The
    // ghost must not speak over the living.
    const inst = waiting();
    const withGhost: WorkflowInstance = {
      ...inst,
      tokens: [...(inst.tokens ?? []), { id: "ghost", at: "deleted-node", scope: "root" }],
    };
    expect(advance(parallelDef, withGhost, "merge")).toEqual({
      ok: false,
      reason: "waiting-on-join",
    });
  });
});

describe("advance — bounding fork runs that never get retired (E4)", () => {
  /** An instance parked one step before `F`, already carrying `count` open fork runs. */
  const withScopes = (count: number): WorkflowInstance => ({
    id: "leaky",
    definitionId: "par",
    definitionVersion: 1,
    current: "start",
    data: {},
    history: [],
    tokens: [{ id: "t", at: "start", scope: ROOT_SCOPE }],
    scopes: Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`s-${i}`, { forkNode: "F", expected: 2, parent: null }]),
    ),
  });

  it("refuses to open one run too many", () => {
    // The map arrives LOADED FROM THE INSTANCE, so this bounds what has accumulated across every
    // previous advance — not merely what one settle call added. A single call cannot reach the cap
    // at all (`maxSteps` stops it far sooner), which is exactly why the bound has to live here.
    expect(advance(parallelDef, withScopes(256), "submit")).toEqual({
      ok: false,
      reason: "scope-overflow",
    });
  });

  it("still opens the last run that fits", () => {
    // Asserts the boundary rather than "a big number fails" — a test that only checks the refusal
    // passes just as well against a cap of zero.
    const out = advance(parallelDef, withScopes(255), "submit");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.instance.scopes ?? {})).toHaveLength(256);
    // Held to this file's standing rule: a success path is checked against the contract, not argued
    // about. 256 scopes must still be a legal instance, or the cap would be refusing at one number
    // and the schema at another.
    expect(workflowInstanceSchema.safeParse(out.instance).success).toBe(true);
  });
});
