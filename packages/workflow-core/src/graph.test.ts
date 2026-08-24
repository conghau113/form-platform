import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { lintGraph, validateGraph } from "./index.js";

const base: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "a",
  nodes: [
    { id: "a", status: "a" },
    { id: "b", status: "b" },
  ],
  transitions: [{ id: "t1", from: "a", to: "b", action: "next" }],
};

describe("validateGraph", () => {
  it("returns no errors for a sound graph", () => {
    expect(validateGraph(base)).toEqual([]);
  });

  it("flags a node unreachable from start", () => {
    const def = {
      ...base,
      nodes: [...base.nodes, { id: "orphan", status: "orphan" }],
    };
    const errors = validateGraph(def);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "unreachable", ref: "orphan" });
  });

  it("flags a transition referencing a missing node", () => {
    const def = {
      ...base,
      transitions: [...base.transitions, { id: "t2", from: "b", to: "ghost", action: "x" }],
    };
    expect(validateGraph(def).some((e) => e.code === "dangling-transition")).toBe(true);
  });

  it("flags a missing start node", () => {
    const def = { ...base, start: "nope" };
    expect(validateGraph(def).some((e) => e.code === "start-missing")).toBe(true);
  });

  it("flags duplicate node ids", () => {
    const def = { ...base, nodes: [base.nodes[0], base.nodes[0], base.nodes[1]] };
    expect(validateGraph(def).some((e) => e.code === "duplicate-node")).toBe(true);
  });
});

describe("lintGraph", () => {
  it("returns no warnings for a sound graph", () => {
    expect(lintGraph(base)).toEqual([]);
  });

  it("does not nag a single-node draft", () => {
    const def: WorkflowDefinition = {
      ...base,
      start: "draft",
      nodes: [{ id: "draft", status: "draft" }],
      transitions: [],
    };
    expect(lintGraph(def)).toEqual([]);
  });

  it("flags the start node when it has no outgoing transition (multi-node)", () => {
    const def = { ...base, transitions: [] };
    const warnings = lintGraph(def);
    expect(warnings.some((w) => w.code === "dead-end" && w.ref === "a")).toBe(true);
  });

  it("flags a kind:normal node that goes nowhere", () => {
    const def: WorkflowDefinition = {
      ...base,
      nodes: [base.nodes[0], { id: "b", status: "b", kind: "normal" }],
    };
    expect(lintGraph(def).some((w) => w.code === "dead-end" && w.ref === "b")).toBe(true);
  });

  it("does not flag a kind:end node with no outgoing", () => {
    const def: WorkflowDefinition = {
      ...base,
      nodes: [base.nodes[0], { id: "b", status: "b", kind: "end" }],
    };
    expect(lintGraph(def)).toEqual([]);
  });

  it("does not flag a legacy (kind-less) terminal node", () => {
    // base.b has no kind and no outgoing — left alone so old definitions don't get nagged.
    expect(lintGraph(base)).toEqual([]);
  });

  it("flags a kind:end node that still has an outgoing transition", () => {
    const def: WorkflowDefinition = {
      ...base,
      nodes: [base.nodes[0], { id: "b", status: "b", kind: "end" }],
      transitions: [
        { id: "t1", from: "a", to: "b", action: "next" },
        { id: "t2", from: "b", to: "a", action: "back" },
      ],
    };
    expect(lintGraph(def).some((w) => w.code === "end-has-outgoing" && w.ref === "b")).toBe(true);
  });
});

describe("validateGraph — gateway rules (E4)", () => {
  /** s --> F(fork) ⇉ A, B --> J(join) --> end. The shape E3a was built to run. */
  const parallel: WorkflowDefinition = {
    ...base,
    start: "s",
    nodes: [
      { id: "s", status: "s" },
      { id: "F", status: "F", gateway: "fork" },
      { id: "A", status: "A" },
      { id: "B", status: "B" },
      { id: "J", status: "J", gateway: "join" },
      { id: "end", status: "end", kind: "end" },
    ],
    transitions: [
      { id: "t0", from: "s", to: "F", action: "go" },
      { id: "fa", from: "F", to: "A", action: "toA" },
      { id: "fb", from: "F", to: "B", action: "toB" },
      { id: "ta", from: "A", to: "J", action: "doneA" },
      { id: "tb", from: "B", to: "J", action: "doneB" },
      { id: "tj", from: "J", to: "end", action: "merge" },
    ],
  };

  it("passes a well-formed fork/join graph", () => {
    expect(validateGraph(parallel)).toEqual([]);
  });

  it("leaves a gateway-less graph alone even where the shapes look gateway-ish", () => {
    // The no-op property these rules live or die by: every one is keyed off `node.gateway`, so a
    // node with one way out (a fork's defect) and a node with two (a join's) must both pass here.
    // If a rule is ever mis-keyed, this is what goes red — not some old fixture nobody re-reads.
    const plain: WorkflowDefinition = {
      ...base,
      nodes: [
        { id: "a", status: "a" },
        { id: "b", status: "b" },
        { id: "c", status: "c" },
      ],
      transitions: [
        { id: "t1", from: "a", to: "b", action: "next" },
        { id: "t2", from: "a", to: "c", action: "other" },
        { id: "t3", from: "b", to: "c", action: "on" },
      ],
    };
    expect(validateGraph(plain)).toEqual([]);
  });

  it("accepts a join reached through a SINGLE incoming edge", () => {
    // Load-bearing. The engine counts a join's siblings by (node, scope) — never by incoming edges —
    // so two branches that funnel through one node before the join still merge correctly. A rule
    // that demanded two incoming edges would reject this graph at save AND at case start (422).
    const funnel: WorkflowDefinition = {
      ...parallel,
      nodes: [...parallel.nodes, { id: "X", status: "X" }],
      transitions: [
        { id: "t0", from: "s", to: "F", action: "go" },
        { id: "fa", from: "F", to: "A", action: "toA" },
        { id: "fb", from: "F", to: "B", action: "toB" },
        { id: "ax", from: "A", to: "X", action: "doneA" },
        { id: "bx", from: "B", to: "X", action: "doneB" },
        { id: "xj", from: "X", to: "J", action: "toJ" },
        { id: "tj", from: "J", to: "end", action: "merge" },
      ],
    };
    expect(validateGraph(funnel)).toEqual([]);
  });

  it("flags a start node that is a fork", () => {
    // Not because the engine cannot run it — it settles before choosing a token, so the fork
    // explodes on the first action (see `engine.test.ts`, "settles a case whose START is a fork").
    // What breaks is the product: the token id the case was stored with is consumed by that settle,
    // so a client echoing it back gets `unknown-token`, and the Run view offers no action for a
    // branch parked on a gateway.
    const def: WorkflowDefinition = {
      ...parallel,
      start: "F",
      nodes: parallel.nodes.filter((n) => n.id !== "s"),
      transitions: parallel.transitions.filter((t) => t.id !== "t0"),
    };
    expect(validateGraph(def)).toEqual([
      expect.objectContaining({ code: "start-is-fork", ref: "F" }),
    ]);
  });

  it("does NOT flag a start node that is a join", () => {
    // Not the same defect: a root-scoped token has no siblings to wait for, so the first settle
    // walks it straight through and the case runs.
    const def: WorkflowDefinition = {
      ...base,
      start: "J",
      nodes: [
        { id: "J", status: "J", gateway: "join" },
        { id: "a", status: "a" },
      ],
      transitions: [{ id: "t1", from: "J", to: "a", action: "go" }],
    };
    expect(validateGraph(def)).toEqual([]);
  });

  it("reports the fork — not the edge — for a gated fork edge", () => {
    // The editor routes a `ref` to its edge highlight only for `dangling-transition`; every other
    // ref is looked up among NODE ids. A transition id here would highlight nothing.
    const def: WorkflowDefinition = {
      ...parallel,
      transitions: parallel.transitions.map((t) =>
        t.id === "fa" ? { ...t, role: "manager" } : t,
      ),
    };
    const errors = validateGraph(def);
    expect(errors).toEqual([expect.objectContaining({ code: "fork-edge-gated", ref: "F" })]);
    expect(errors[0].message).toContain("fa");
  });

  it("counts the offending edges in the message rather than just naming the rule", () => {
    // `B` is re-attached under `A` rather than left dangling: dropping the fork's second edge would
    // otherwise also make `B` unreachable, and this test would be reading a two-error result while
    // claiming to measure one rule.
    const def: WorkflowDefinition = {
      ...parallel,
      transitions: [
        ...parallel.transitions.filter((t) => t.id !== "fb"),
        { id: "ab", from: "A", to: "B", action: "then" },
      ],
    };
    const errors = validateGraph(def);
    expect(errors.map((e) => e.code)).toEqual(["fork-single-outgoing"]);
    expect(errors[0].ref).toBe("F");
    expect(errors[0].message).toContain("1 outgoing");
  });

  it("reports the join — not the edge — for a gated join exit", () => {
    // Symmetric with the fork case: the engine follows a join's way out the moment its last sibling
    // arrives, without consulting a `guard` or `role` on it. Before E4 the only path that ever
    // evaluated one was a person firing the join by hand, which E4 removes — so leaving the edge
    // acceptable would turn a half-working gate into a silently dead one.
    const def: WorkflowDefinition = {
      ...parallel,
      transitions: parallel.transitions.map((t) =>
        t.id === "tj" ? { ...t, guard: { rule: { "==": [1, 1] } } } : t,
      ),
    };
    const errors = validateGraph(def);
    expect(errors).toEqual([expect.objectContaining({ code: "join-edge-gated", ref: "J" })]);
    expect(errors[0].message).toContain("tj");
  });

  it("flags a join with more than one way out", () => {
    const def: WorkflowDefinition = {
      ...parallel,
      nodes: [...parallel.nodes, { id: "other", status: "other" }],
      transitions: [
        ...parallel.transitions,
        { id: "tj2", from: "J", to: "other", action: "reject" },
      ],
    };
    expect(validateGraph(def)).toEqual([
      expect.objectContaining({ code: "join-not-one-outgoing", ref: "J" }),
    ]);
  });

  it("flags a join with no way out at all", () => {
    const def: WorkflowDefinition = {
      ...parallel,
      nodes: parallel.nodes.filter((n) => n.id !== "end"),
      transitions: parallel.transitions.filter((t) => t.id !== "tj"),
    };
    expect(validateGraph(def)).toEqual([
      expect.objectContaining({ code: "join-not-one-outgoing", ref: "J" }),
    ]);
  });
});
