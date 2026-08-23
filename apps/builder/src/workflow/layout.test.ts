import { describe, expect, it } from "vitest";
import { sideLaneSinks, tidyLayout } from "./layout";
import type { FlowEdge, FlowNode } from "./workflow-model";

function node(id: string): FlowNode {
  return { id, type: "workflow", position: { x: 0, y: 0 }, data: { status: id, isStart: false } };
}
function edge(source: string, target: string, suffix = ""): FlowEdge {
  return { id: `${source}-${target}${suffix}`, source, target, data: { action: "next" } };
}
/** A chain a→b→c→… plus its nodes, the shape a workflow's main run takes. */
function chain(...ids: string[]): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return {
    nodes: ids.map(node),
    edges: ids.slice(1).map((id, i) => edge(ids[i], id)),
  };
}
const byId = (nodes: FlowNode[], id: string) => {
  const found = nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node ${id}`);
  return found;
};
function labeledEdge(source: string, target: string): FlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label: "submit",
    data: { action: "submit", role: "reviewer", guard: { rule: { "==": [{ var: "ok" }, true] } } },
  };
}

describe("tidyLayout", () => {
  it("returns nodes unchanged for an empty graph", () => {
    expect(tidyLayout([], [])).toEqual([]);
  });

  it("ranks a chain left-to-right by x", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const out = tidyLayout(nodes, edges);

    const x = Object.fromEntries(out.map((n) => [n.id, n.position.x]));
    expect(x.a).toBeLessThan(x.b);
    expect(x.b).toBeLessThan(x.c);
    // positions are concrete integers, never NaN
    for (const n of out) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it("reserves more horizontal room between columns for labeled/guarded edges (#6)", () => {
    const nodes = [node("a"), node("b")];
    const bare = tidyLayout(nodes, [edge("a", "b")]);
    const labeled = tidyLayout(nodes, [labeledEdge("a", "b")]);
    const gap = (out: FlowNode[]) => {
      const x = Object.fromEntries(out.map((n) => [n.id, n.position.x]));
      return x.b - x.a;
    };
    expect(gap(labeled)).toBeGreaterThan(gap(bare));
  });

  it("ranks the same chain top-to-bottom by y when asked for a vertical layout", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const out = tidyLayout(nodes, edges, "TB");

    const pos = Object.fromEntries(out.map((n) => [n.id, n.position]));
    expect(pos.a.y).toBeLessThan(pos.b.y);
    expect(pos.b.y).toBeLessThan(pos.c.y);
    // …and it is a COLUMN, not a row that happens to descend: a chain shares one x under TB, which
    // is what tells "the direction was applied" apart from "dagre moved things around".
    expect(pos.a.x).toBe(pos.b.x);
    expect(pos.b.x).toBe(pos.c.x);
  });

  it("keeps the spine in one straight column when a state branches", () => {
    // `a→b→c→e` with `d` hanging off `b`. dagre's default centres `b` over BOTH its children, so the
    // spine kinks sideways the moment anything branches — measured: a,b at x=216 while c,e sit at 90.
    // A chain with no branch aligns under either rule, so only this shape tells them apart.
    const nodes = [node("a"), node("b"), node("c"), node("d"), node("e")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("b", "d"), edge("c", "e")];
    const x = Object.fromEntries(tidyLayout(nodes, edges, "TB").map((n) => [n.id, n.position.x]));
    expect(x.b).toBe(x.a);
    expect(x.c).toBe(x.a);
    expect(x.e).toBe(x.a);
    // …and the side branch is genuinely off to one side, or "all aligned" would be trivially true.
    expect(x.d).not.toBe(x.a);
  });

  it("keeps the spine in one straight row when arranged horizontally too", () => {
    // Same shape, other direction — the owner asked for the straight run in the vertical view, but
    // the setting applies to both and only this gates the horizontal one.
    const nodes = [node("a"), node("b"), node("c"), node("d"), node("e")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("b", "d"), edge("c", "e")];
    const y = Object.fromEntries(tidyLayout(nodes, edges, "LR").map((n) => [n.id, n.position.y]));
    expect(y.b).toBe(y.a);
    expect(y.c).toBe(y.a);
    expect(y.e).toBe(y.a);
    expect(y.d).not.toBe(y.a);
  });

  it("still lays out left-to-right when no direction is given", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("b", "c")];
    // The three existing call sites pass two arguments; the default is what keeps them working.
    expect(tidyLayout(nodes, edges)).toEqual(tidyLayout(nodes, edges, "LR"));
  });

  it("preserves id/data and does not mutate the input", () => {
    const nodes = [node("a"), node("b")];
    const input = structuredClone(nodes);
    const out = tidyLayout(nodes, [edge("a", "b")]);
    expect(out.map((n) => n.id)).toEqual(["a", "b"]);
    expect(out[0].data).toEqual({ status: "a", isStart: false });
    expect(nodes).toEqual(input); // untouched
  });
});

describe("sideLaneSinks", () => {
  it("picks a terminal state that three different states drain into", () => {
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("x"));
    edges.push(edge("a", "x"), edge("b", "x"), edge("c", "x"));
    expect([...sideLaneSinks(nodes, edges)]).toEqual(["x"]);
  });

  it("counts distinct SOURCES, not transitions", () => {
    // Three ways to bail out of ONE step is a branch point, not a collection point: `x` has three
    // incoming transitions but only one state drains into it.
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("x"));
    edges.push(edge("a", "x", "-1"), edge("a", "x", "-2"), edge("a", "x", "-3"));
    expect([...sideLaneSinks(nodes, edges)]).toEqual([]);
  });

  it("leaves the end of the flow alone", () => {
    // `done` in the demo workflow: terminal, but a single state leads to it.
    const { nodes, edges } = chain("a", "b", "c");
    expect([...sideLaneSinks(nodes, edges)]).toEqual([]);
  });

  it("ignores a well-drained state that still leads somewhere", () => {
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("x"), node("y"));
    edges.push(edge("a", "x"), edge("b", "x"), edge("c", "x"), edge("x", "y"));
    expect([...sideLaneSinks(nodes, edges)]).toEqual([]);
  });

  it("counts only sources that EXIST, so ghost transitions cannot make a collection point", () => {
    // Same shape as the passing case below it, except one of the three sources was never emitted.
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("x"));
    edges.push(edge("a", "x"), edge("b", "x"), edge("ghost", "x"));
    expect([...sideLaneSinks(nodes, edges)]).toEqual([]);

    nodes.push(node("ghost"));
    expect([...sideLaneSinks(nodes, edges)]).toEqual(["x"]); // ...and it does once `ghost` is real
  });
});

/**
 * Steps 2 (keep the sink out of dagre) and 3 (park it beside the spine) are gated SEPARATELY, and
 * each needs its own fixture shape to bite:
 *  - step 2 only shows up when the sink shares a rank with a branch and so competes for slots in it
 *    — measured, leaving the sink in moves `b` to x=136 and `c` to x=272 off a straight spine. On
 *    the demo workflow the sink gets a column to itself and nothing moves, so a PCT-shaped fixture
 *    would have missed this entirely;
 *  - step 3 only shows up where dagre's rank and the sources' median DIFFER.
 * A fixture that satisfies one does not exercise the other.
 */
describe("tidyLayout side lane", () => {
  // a→b→c→d→e→f with a,b,c also draining into x. dagre would rank x after c (level 3, i.e. beside
  // `d`); the side lane puts it at the median of a/b/c, which is `b`. Those must not coincide, or
  // the test cannot tell the two rules apart.
  function graph() {
    const { nodes, edges } = chain("a", "b", "c", "d", "e", "f");
    nodes.push(node("x"));
    edges.push(edge("a", "x"), edge("b", "x"), edge("c", "x"));
    return { nodes, edges };
  }

  it("keeps the sink out of dagre so it cannot bend the spine", () => {
    // This is what step "leave the sink out of the graph" buys, and the ONLY thing that shows it:
    // a collection point sharing a rank with a branch competes for slots in that rank, and dagre
    // answers by shifting the main run sideways. Measured on this fixture with the sink left in:
    // b moves to x=136 and c to x=272 while a stays at 0 — the spine the whole `align:"UL"` effort
    // exists to keep straight. (On the demo workflow the sink gets a column of its own, so nothing
    // moves and this would have gone unnoticed.)
    const nodes = ["a", "b", "c", "p", "q", "x"].map(node);
    const edges = [
      edge("a", "b"),
      edge("b", "c"),
      edge("b", "p"),
      edge("p", "q"),
      edge("a", "x"),
      edge("b", "x"),
      edge("c", "x"),
    ];
    const out = tidyLayout(nodes, edges, "TB");
    const spine = ["a", "b", "c"].map((id) => byId(out, id).position.x);
    expect(spine).toEqual([spine[0], spine[0], spine[0]]);
    expect(byId(out, "p").position.x).not.toBe(spine[0]); // the branch really is off to the side
  });

  it("parks the sink at its sources' median row, not at the rank dagre would give it", () => {
    const { nodes, edges } = graph();
    const out = tidyLayout(nodes, edges, "TB");
    const x = byId(out, "x");
    const b = byId(out, "b");
    const d = byId(out, "d");
    expect(b.position.y).not.toBe(d.position.y); // the fixture really does separate the two answers
    expect(x.position.y).toBe(b.position.y);
  });

  it("puts the sink in a lane clear of every state on the spine", () => {
    const { nodes, edges } = graph();
    const out = tidyLayout(nodes, edges, "TB");
    const spineRight = Math.max(
      ...out.filter((n) => n.id !== "x").map((n) => n.position.x + (n.measured?.width ?? 180)),
    );
    expect(byId(out, "x").position.x).toBeGreaterThan(spineRight);
  });

  it("turns the lane sideways when the graph runs left-to-right", () => {
    const { nodes, edges } = graph();
    const out = tidyLayout(nodes, edges, "LR");
    const spineBottom = Math.max(
      ...out.filter((n) => n.id !== "x").map((n) => n.position.y + (n.measured?.height ?? 64)),
    );
    expect(byId(out, "x").position.y).toBeGreaterThan(spineBottom);
    expect(byId(out, "x").position.x).toBe(byId(out, "b").position.x);
  });

  it("keeps two sinks off each other when they drain the same states", () => {
    // Identical source sets ⇒ identical medians ⇒ both want the same slot in the one shared lane.
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("x"), node("y"));
    for (const src of ["a", "b", "c"]) {
      edges.push(edge(src, "x"), edge(src, "y"));
    }
    const out = tidyLayout(nodes, edges, "TB");
    const x = byId(out, "x");
    const y = byId(out, "y");
    expect(x.position.x).toBe(y.position.x); // one shared lane
    expect(Math.abs(x.position.y - y.position.y)).toBeGreaterThanOrEqual(64); // …but not stacked
  });

  it("leaves a terminal state to dagre when too few states drain into it", () => {
    // Regression guard: an ordinary end state must keep being RANKED, not flung into the margin.
    // Two sources ⇒ the side lane would centre it on their median, which is `b`'s own row; dagre
    // ranks it strictly after both. (It does get its own column here — that is dagre branching, not
    // the lane, which would sit a further 160px out.)
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("end"));
    edges.push(edge("a", "end"), edge("b", "end"));
    const out = tidyLayout(nodes, edges, "TB");
    const end = byId(out, "end");
    expect(end.position.y).toBeGreaterThan(byId(out, "b").position.y);
    const spineRight = Math.max(
      ...out.filter((n) => n.id !== "end").map((n) => n.position.x + 180),
    );
    expect(end.position.x).toBeLessThan(spineRight + 160);
  });

  it("lays out a terminal whose sources are all dangling instead of stranding it", () => {
    // `applyGenerated` tidies UNVALIDATED model output, so transitions naming a state that does not
    // exist are a live state, not a theory. Counting those ghosts toward the ≥3 threshold made `x` a
    // collection point: pulled out of dagre, then skipped by `placeSideLane` because no REAL source
    // could be centred on — so it kept its incoming position while everything else moved, landing on
    // top of `a`. It must be ranked by dagre like any other terminal.
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push({ ...node("x"), position: { x: 7, y: 9 } });
    edges.push(edge("ghost1", "x"), edge("ghost2", "x"), edge("ghost3", "x"));
    const out = tidyLayout(nodes, edges, "TB");
    const x = byId(out, "x");
    const a = byId(out, "a");
    expect(x.position).not.toEqual({ x: 7, y: 9 }); // it was actually laid out
    // and it does not overlap the state it used to be dropped on (180x64 boxes).
    const overlaps =
      Math.abs(x.position.x - a.position.x) < 180 && Math.abs(x.position.y - a.position.y) < 64;
    expect(overlaps).toBe(false);
  });

  it("does not promote a two-source terminal that a dangling transition would top up to three", () => {
    // The threshold is three states that EXIST. `end` has two real sources plus one ghost; counting
    // the ghost tips it over and parks it in the side lane, 160px past the spine's far edge.
    const { nodes, edges } = chain("a", "b", "c");
    nodes.push(node("end"));
    edges.push(edge("a", "end"), edge("b", "end"), edge("ghost", "end"));
    expect([...sideLaneSinks(nodes, edges)]).toEqual([]);
    const out = tidyLayout(nodes, edges, "TB");
    const spineRight = Math.max(
      ...out.filter((n) => n.id !== "end").map((n) => n.position.x + 180),
    );
    expect(byId(out, "end").position.x).toBeLessThan(spineRight + 160);
  });
});
