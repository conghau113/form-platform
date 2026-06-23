import { describe, expect, it } from "vitest";
import { tidyLayout } from "./layout";
import type { FlowEdge, FlowNode } from "./workflow-model";

function node(id: string): FlowNode {
  return { id, type: "workflow", position: { x: 0, y: 0 }, data: { status: id, isStart: false } };
}
function edge(source: string, target: string): FlowEdge {
  return { id: `${source}-${target}`, source, target, data: { action: "next" } };
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

  it("preserves id/data and does not mutate the input", () => {
    const nodes = [node("a"), node("b")];
    const input = structuredClone(nodes);
    const out = tidyLayout(nodes, [edge("a", "b")]);
    expect(out.map((n) => n.id)).toEqual(["a", "b"]);
    expect(out[0].data).toEqual({ status: "a", isStart: false });
    expect(nodes).toEqual(input); // untouched
  });
});
