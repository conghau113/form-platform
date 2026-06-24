import { describe, expect, it } from "vitest";
import { traceUpstream } from "./path";

const e = (source: string, target: string) => ({ id: `${source}-${target}`, source, target });

describe("traceUpstream", () => {
  it("includes only the clicked node when nothing flows into it", () => {
    const t = traceUpstream("a", [e("a", "b"), e("b", "c")]);
    expect([...t.nodeIds]).toEqual(["a"]);
    expect(t.edgeIds.size).toBe(0);
  });

  it("collects the full ancestry of a chain back to the start", () => {
    const edges = [e("a", "b"), e("b", "c")];
    const t = traceUpstream("c", edges);
    expect([...t.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...t.edgeIds].sort()).toEqual(["a-b", "b-c"]);
  });

  it("merges multiple incoming branches", () => {
    // a→c and b→c both feed c
    const t = traceUpstream("c", [e("a", "c"), e("b", "c"), e("c", "d")]);
    expect([...t.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...t.edgeIds].sort()).toEqual(["a-c", "b-c"]);
    // the downstream edge c→d is NOT part of the upstream path
    expect(t.edgeIds.has("c-d")).toBe(false);
  });

  it("terminates on cycles", () => {
    // a→b→a is a loop; tracing b must not spin
    const t = traceUpstream("b", [e("a", "b"), e("b", "a")]);
    expect([...t.nodeIds].sort()).toEqual(["a", "b"]);
    expect([...t.edgeIds].sort()).toEqual(["a-b", "b-a"]);
  });
});
