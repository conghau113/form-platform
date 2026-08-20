import { describe, expect, it } from "vitest";
import { tidyLayout } from "./layout";
import type { FlowEdge, FlowNode } from "./workflow-model";

function node(id: string): FlowNode {
  return { id, type: "workflow", position: { x: 0, y: 0 }, data: { status: id, isStart: false } };
}
function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, data: { action: "next" } };
}
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
