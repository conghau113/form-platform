import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import {
  axisEdgeParams,
  edgeGeometry,
  edgeLane,
  getEdgeParams,
  LABEL_EXTRA_SIDEWAYS,
  LABEL_EXTRA_STACKED,
  LANE_STEP,
  labelOffsetFor,
  type NodeBox,
  offsetAlongNormal,
  RECIPROCAL_LANE,
} from "./floating-edge";

const box = (x: number, y: number): NodeBox => ({ x, y, width: 100, height: 50 });

describe("axisEdgeParams", () => {
  it("anchors bottom-to-top, at the middle of each side, for a box below", () => {
    const p = axisEdgeParams(box(0, 0), box(0, 300));
    expect(p).not.toBeNull();
    expect(p?.sourcePos).toBe(Position.Bottom);
    expect(p?.targetPos).toBe(Position.Top);
    expect([p?.sx, p?.sy]).toEqual([50, 50]); // mid-width of the source's bottom side
    expect([p?.tx, p?.ty]).toEqual([50, 300]);
  });

  it("anchors right-to-left for a box beside", () => {
    const p = axisEdgeParams(box(0, 0), box(300, 0));
    expect(p?.sourcePos).toBe(Position.Right);
    expect(p?.targetPos).toBe(Position.Left);
    expect([p?.sx, p?.sy]).toEqual([100, 25]);
    expect([p?.tx, p?.ty]).toEqual([300, 25]);
  });

  it("anchors backwards when the target is above / to the left", () => {
    expect(axisEdgeParams(box(0, 300), box(0, 0))?.sourcePos).toBe(Position.Top);
    expect(axisEdgeParams(box(300, 0), box(0, 0))?.sourcePos).toBe(Position.Left);
  });

  // The two branches that decide the whole thing. This is the demo workflow's `created → cancelled`
  // shape: separated on BOTH axes, and the narrow gap is the one to leave through.
  it("leaves through the narrow gap when the boxes are apart on both axes", () => {
    // 160px of horizontal gap against 550px of vertical ⇒ sideways.
    expect(axisEdgeParams(box(0, 0), box(260, 600))?.sourcePos).toBe(Position.Right);
    // ...and the other way round: 50px of vertical gap against 300px of horizontal ⇒ downwards.
    expect(axisEdgeParams(box(0, 0), box(400, 100))?.sourcePos).toBe(Position.Bottom);
  });

  it("gives up when the boxes overlap on both axes, leaving the floating anchors to cope", () => {
    // Dragging one state onto another: no pair of sides faces the other box.
    expect(axisEdgeParams(box(0, 0), box(20, 20))).toBeNull();
  });
});

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

/**
 * That symmetry above is exactly the defect users see: `A→B` and `B→A` come back as the two ends of
 * ONE segment, so both render on the same line with their action labels at identical coordinates.
 * These cover the lane that pulls them apart.
 */
describe("edgeLane", () => {
  const bothWays = [
    { id: "t1", source: "a", target: "b" },
    { id: "t2", source: "b", target: "a" },
  ];
  // Two transitions with the SAME from→to — different guards, one action. This is the shape the
  // reciprocal-only rule was blind to, and the one the demo workflow actually contains.
  const parallel = [
    { id: "t1", source: "a", target: "b" },
    { id: "t2", source: "a", target: "b" },
  ];

  it("stays 0 for a lone edge, so ordinary edges never move", () => {
    expect(edgeLane([{ id: "t1", source: "a", target: "b" }], "t1", "a", "b")).toBe(0);
  });

  it("offsets both directions of a reciprocal pair", () => {
    // Literals, not the constants: asserting against `RECIPROCAL_LANE` measures nothing about the
    // lane WIDTH, because setting that constant to 0 moves both sides of the comparison together.
    expect(Math.abs(edgeLane(bothWays, "t1", "a", "b"))).toBe(16);
    expect(Math.abs(edgeLane(bothWays, "t2", "b", "a"))).toBe(16);
    expect(RECIPROCAL_LANE).toBe(16); // the constants the rest of the file reads are these numbers
    expect(LANE_STEP).toBe(32);
  });

  it("gives both directions of a reciprocal pair the SAME lane, never mirrored ones", () => {
    // The separation comes from each edge's own normal, which already flips with the axis, so the
    // two land on opposite sides while carrying one number.
    expect(edgeLane(bothWays, "t1", "a", "b")).toBe(edgeLane(bothWays, "t2", "b", "a"));
  });

  it("gives two SAME-DIRECTION edges opposite lanes", () => {
    // Both run a→b, so both normals point the same way — here, and only here, the lane numbers
    // themselves have to differ. The reciprocal-only rule answered 0 for both.
    expect(edgeLane(parallel, "t1", "a", "b")).toBe(-16);
    expect(edgeLane(parallel, "t2", "a", "b")).toBe(16);
  });

  it("pins all three lanes of a mixed group, where the direction flip is what decides", () => {
    // Two a→b plus one b→a. Physical position = lane × own normal, so `t3`'s −32 sits on the
    // OPPOSITE side from `t1`'s −32: the three occupy −32, 0, +32 of the canonical axis. Drop the
    // flip and `t3` answers +32, landing on top of `t1`.
    const mixed = [...parallel, { id: "t3", source: "b", target: "a" }];
    expect(edgeLane(mixed, "t1", "a", "b")).toBe(-32);
    expect(edgeLane(mixed, "t2", "a", "b")).toBe(0);
    expect(edgeLane(mixed, "t3", "b", "a")).toBe(-32);
  });

  it("does not depend on the order the store hands the edges back", () => {
    expect(edgeLane([...parallel].reverse(), "t1", "a", "b")).toBe(
      edgeLane(parallel, "t1", "a", "b"),
    );
  });

  it("stays 0 for an id the store no longer knows", () => {
    // `id` comes off the rendered edge, `edges` off the store; they disagree for a frame while an
    // edge is replaced. Without the guard `findIndex` answers -1, which is a finite, wrong slot.
    expect(edgeLane(parallel, "t-gone", "a", "b")).toBe(0);
  });

  it("stays 0 for self-loops, which are their own reverse", () => {
    // TWO loops on one node, or this proves nothing: a single loop forms a group of one and exits
    // through `group.length <= 1` even with the self-loop guard deleted. With two, dropping the
    // guard hands them −16 and +16 — a self-loop has no meaningful normal to be offset along.
    const loops = [
      { id: "t1", source: "a", target: "a" },
      { id: "t2", source: "a", target: "a" },
    ];
    expect(edgeLane(loops, "t1", "a", "a")).toBe(0);
    expect(edgeLane(loops, "t2", "a", "a")).toBe(0);
  });
});

describe("offsetAlongNormal", () => {
  const a = box(0, 0);
  const b = box(300, 0);

  it("returns the params untouched when there is no lane", () => {
    const p = getEdgeParams(a, b);
    expect(offsetAlongNormal(p, 0, a, b)).toEqual(p);
  });

  it("never emits NaN when the two nodes sit on the same centre", () => {
    const same = box(0, 0);
    const p = getEdgeParams(same, same);
    const out = offsetAlongNormal(p, RECIPROCAL_LANE, same, same);
    // Dragging one node fully onto another reaches this; a zero-length axis has no normal, and
    // dividing by it would put NaN straight into the SVG path, erasing the edge.
    expect(Number.isNaN(out.sx)).toBe(false);
    expect(Number.isNaN(out.sy)).toBe(false);
    expect(out).toEqual(p);
  });

  it("puts a horizontal pair on two lanes, at exact opposite offsets", () => {
    // Pinned as coordinates, not as "opposite sides": flipping the normal globally would flip BOTH
    // edges and still read as opposite, so only the actual numbers catch that.
    const ab = offsetAlongNormal(getEdgeParams(a, b), RECIPROCAL_LANE, a, b);
    const ba = offsetAlongNormal(getEdgeParams(b, a), RECIPROCAL_LANE, b, a);
    expect([ab.sx, ab.sy, ab.tx, ab.ty]).toEqual([100, 41, 300, 41]);
    expect([ba.sx, ba.sy, ba.tx, ba.ty]).toEqual([300, 9, 100, 9]);
  });

  it("separates a vertical pair along x instead of y", () => {
    const top = box(0, 0);
    const bottom = box(0, 300);
    const down = offsetAlongNormal(getEdgeParams(top, bottom), RECIPROCAL_LANE, top, bottom);
    const up = offsetAlongNormal(getEdgeParams(bottom, top), RECIPROCAL_LANE, bottom, top);
    expect([down.sx, down.sy, down.tx, down.ty]).toEqual([34, 50, 34, 300]);
    expect([up.sx, up.sy, up.tx, up.ty]).toEqual([66, 300, 66, 50]);
  });

  it("keeps the anchor on the node when the offset would push it past a corner", () => {
    // Pinned, not bounded: `sy` unclamped would be 53.02 and the box ends at 50, so only the exact
    // number proves the clamp fired. `ty` is pinned too — unclamped it lands at 128.02, INSIDE the
    // target, so a `toBeLessThanOrEqual` there passes whether or not clamping exists at all.
    const from = box(0, 0);
    const to = { x: 400, y: 100, width: 100, height: 50 };
    const out = offsetAlongNormal(getEdgeParams(from, to), RECIPROCAL_LANE, from, to);
    expect([out.sx, out.sy].map((v) => Math.round(v * 100) / 100)).toEqual([96.12, 50]);
    expect([out.tx, out.ty].map((v) => Math.round(v * 100) / 100)).toEqual([400, 128.02]);
  });

  it("never lets an anchor leave its box — either axis, either end", () => {
    // A group of many edges pushes lanes well past 16, and the two cases above only ever exercise
    // the SOURCE end on the Y axis. These pin the X axis and the target end as well.
    const top = box(0, 0);
    const bottom = box(0, 300);
    const vertical = offsetAlongNormal(getEdgeParams(top, bottom), 200, top, bottom);
    expect([vertical.sx, vertical.sy, vertical.tx, vertical.ty]).toEqual([0, 50, 0, 300]);

    const left = box(0, 0);
    const right = box(300, 0);
    const horizontal = offsetAlongNormal(getEdgeParams(left, right), 200, left, right);
    expect([horizontal.sx, horizontal.sy, horizontal.tx, horizontal.ty]).toEqual([
      100, 50, 300, 50,
    ]);
  });
});

describe("labelOffsetFor", () => {
  it("leaves a one-way edge's label at the path midpoint", () => {
    expect(labelOffsetFor(getEdgeParams(box(0, 0), box(300, 0)), 0)).toEqual({ dx: 0, dy: 0 });
  });

  it("pushes labels apart vertically for a side-by-side pair", () => {
    const out = labelOffsetFor(getEdgeParams(box(0, 0), box(300, 0)), RECIPROCAL_LANE);
    expect(Math.abs(out.dx)).toBe(0); // `Math.abs` so a signed zero reads as zero
    expect(Math.abs(out.dy)).toBe(LABEL_EXTRA_STACKED);
  });

  it("pushes them MUCH further apart horizontally for a stacked pair", () => {
    // The stacked figure would leave 72px between label centres — less than one 140px label box, so
    // a reciprocal pair inside a vertical arrangement would overlap exactly as before.
    const out = labelOffsetFor(getEdgeParams(box(0, 0), box(0, 300)), RECIPROCAL_LANE);
    expect(Math.abs(out.dy)).toBe(0);
    expect(Math.abs(out.dx)).toBe(LABEL_EXTRA_SIDEWAYS);
    expect(Math.abs(out.dx)).toBeGreaterThan(LABEL_EXTRA_STACKED);
  });
});

/**
 * The three steps above only mean anything composed. Testing them apart left the wiring ungated:
 * dropping the label shift from the rendered edge kept every unit test green while putting two
 * labels 32px apart — which IS the reported bug. These measure the finished separation.
 */
describe("edgeGeometry", () => {
  function labelsOf(a: NodeBox, b: NodeBox, lane: number) {
    const ab = edgeGeometry(lane, a, b);
    const ba = edgeGeometry(lane, b, a);
    return {
      dx: Math.abs(ab.labelX - ba.labelX),
      dy: Math.abs(ab.labelY - ba.labelY),
      ab,
      ba,
    };
  }

  it("separates a side-by-side pair's labels by more than a full label column", () => {
    // 2*RECIPROCAL_LANE (the two paths) + 2*LABEL_EXTRA_STACKED (each label off its own path).
    // A label column with an action, a role chip and a guard chip is 74px tall.
    // Pinned as a LITERAL: writing the sum of the constants makes both sides of the assertion move
    // together, so shrinking the clearance back to its old value would keep this green.
    const out = labelsOf(box(0, 0), box(300, 0), RECIPROCAL_LANE);
    expect(out.dy).toBe(96);
    expect(out.dy).toBeGreaterThan(74);
    expect(out.dx).toBe(0);
  });

  it("holds the stacked clearance at the measured value", () => {
    expect(LABEL_EXTRA_STACKED).toBe(32);
  });

  it("separates a stacked pair's labels by more than a full label width", () => {
    const out = labelsOf(box(0, 0), box(0, 300), RECIPROCAL_LANE);
    expect(out.dx).toBe(2 * RECIPROCAL_LANE + 2 * LABEL_EXTRA_SIDEWAYS);
    expect(out.dx).toBeGreaterThan(150);
    expect(out.dy).toBe(0);
  });

  it("leaves a laneless edge's label exactly on its own path midpoint", () => {
    const laneless = edgeGeometry(0, box(0, 0), box(300, 0));
    expect([laneless.labelX, laneless.labelY]).toEqual([200, 25]);
  });

  it("returns a path that follows the LANED endpoints, not the centre line", () => {
    // Guards the other half of the composition: a geometry that shifted only the label would leave
    // the two arrows drawn on top of each other with their labels floating off to the sides.
    const a = box(0, 0);
    const b = box(300, 0);
    // Pinned whole, not by prefix: the un-laned path is the centre line at y=25 and the laned one
    // runs a full lane below it, at y=41, along its entire length.
    expect(edgeGeometry(RECIPROCAL_LANE, a, b).path).toBe(
      "M100 41L120 41L200 41L200 41L280 41L300 41",
    );
    expect(edgeGeometry(0, a, b).path).toBe("M100 25L120 25L200 25L200 25L280 25L300 25");
  });

  it("picks the anchors itself, by the axis rule and not by the centre line", () => {
    // The fixture is chosen so the two rules DISAGREE — anywhere they agree, forcing the old
    // free-floating anchors back in would leave this green. Boxes 300px apart horizontally but only
    // 50px vertically: `getEdgeParams` leaves the source's RIGHT border at (100, 37.5), the axis
    // rule leaves its BOTTOM at (50, 50) because the vertical gap is the narrow one.
    const a = box(0, 0);
    const b = box(400, 100);
    expect(getEdgeParams(a, b).sourcePos).toBe(Position.Right);
    // Measured, and pinned whole: down out of the source's bottom, across at y=75, up into the
    // target's top. Nothing here starts at x=100, which is where the centre line would have left.
    expect(edgeGeometry(0, a, b).path).toBe(
      "M50 50L50 70L 50,72.5Q 50,75 52.5,75L 447.5,75Q 450,75 450,77.5L450 80L450 100",
    );
  });

  it("stays finite when two boxes touch with their centres aligned", () => {
    // The axis rule can put the source point exactly on the target point (boxes flush, same centre),
    // which leaves the edge no direction to take a lane from. It must degrade, not emit NaN.
    const a = box(0, 0);
    const b = box(0, 50);
    const out = edgeGeometry(RECIPROCAL_LANE, a, b);
    expect(Number.isFinite(out.labelX)).toBe(true);
    expect(Number.isFinite(out.labelY)).toBe(true);
    expect(out.path).not.toContain("NaN");
  });
});
