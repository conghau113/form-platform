import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { getEdgeParams, type NodeBox } from "./floating-edge";

const box = (x: number, y: number): NodeBox => ({ x, y, width: 100, height: 50 });

describe("getEdgeParams", () => {
  it("attaches to right/left borders for a horizontal layout", () => {
    const p = getEdgeParams(box(0, 0), box(300, 0));
    expect(p.sourcePos).toBe(Position.Right);
    expect(p.targetPos).toBe(Position.Left);
    expect(Math.round(p.sx)).toBe(100); // source right border
    expect(Math.round(p.tx)).toBe(300); // target left border
    expect(Math.round(p.sy)).toBe(25); // mid-height
    expect(Math.round(p.ty)).toBe(25);
  });

  it("attaches to bottom/top borders for a vertical layout", () => {
    const p = getEdgeParams(box(0, 0), box(0, 300));
    expect(p.sourcePos).toBe(Position.Bottom);
    expect(p.targetPos).toBe(Position.Top);
    expect(Math.round(p.sy)).toBe(50); // source bottom border
    expect(Math.round(p.ty)).toBe(300); // target top border
  });

  it("is symmetric: swapping source/target mirrors the endpoints", () => {
    const a = getEdgeParams(box(0, 0), box(300, 0));
    const b = getEdgeParams(box(300, 0), box(0, 0));
    expect(Math.round(b.sx)).toBe(Math.round(a.tx));
    expect(Math.round(b.tx)).toBe(Math.round(a.sx));
    expect(b.sourcePos).toBe(a.targetPos);
    expect(b.targetPos).toBe(a.sourcePos);
  });
});
