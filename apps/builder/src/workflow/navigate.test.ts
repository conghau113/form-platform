import { describe, expect, it } from "vitest";
import { type NavNode, pickNeighbor } from "./navigate";

// A 3x3 grid of point-nodes (no width/height) spaced 100 apart; ids are r{row}c{col}.
const grid: NavNode[] = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 3; c++) {
    grid.push({ id: `r${r}c${c}`, position: { x: c * 100, y: r * 100 } });
  }
}

describe("pickNeighbor", () => {
  it("moves to the immediate neighbor in each direction", () => {
    expect(pickNeighbor(grid, "r1c1", "right")).toBe("r1c2");
    expect(pickNeighbor(grid, "r1c1", "left")).toBe("r1c0");
    expect(pickNeighbor(grid, "r1c1", "up")).toBe("r0c1");
    expect(pickNeighbor(grid, "r1c1", "down")).toBe("r2c1");
  });

  it("returns null when there is no node in that direction", () => {
    expect(pickNeighbor(grid, "r0c0", "up")).toBeNull();
    expect(pickNeighbor(grid, "r2c2", "down")).toBeNull();
    expect(pickNeighbor(grid, "r0c0", "left")).toBeNull();
  });

  it("returns null when there is no current selection or it is unknown", () => {
    expect(pickNeighbor(grid, null, "right")).toBeNull();
    expect(pickNeighbor(grid, "ghost", "right")).toBeNull();
  });

  it("ignores nodes outside the 45° cone (a node mostly above is not 'right')", () => {
    const nodes: NavNode[] = [
      { id: "a", position: { x: 0, y: 0 } },
      // slightly right but far above: perpendicular (|dy|) dominates → not a 'right' candidate
      { id: "above", position: { x: 20, y: -300 } },
      // clearly to the right
      { id: "right", position: { x: 200, y: 0 } },
    ];
    expect(pickNeighbor(nodes, "a", "right")).toBe("right");
    expect(pickNeighbor(nodes, "a", "up")).toBe("above");
  });

  it("picks the Euclidean-nearest when several lie in the cone", () => {
    const nodes: NavNode[] = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "near", position: { x: 100, y: 0 } },
      { id: "far", position: { x: 300, y: 0 } },
    ];
    expect(pickNeighbor(nodes, "a", "right")).toBe("near");
  });

  it("uses node center (width/height) so unequal box sizes still resolve direction", () => {
    const nodes: NavNode[] = [
      { id: "a", position: { x: 0, y: 0 }, width: 200, height: 60 },
      { id: "b", position: { x: 300, y: 0 }, width: 200, height: 60 },
    ];
    // a center (100,30), b center (400,30) → b is to the right
    expect(pickNeighbor(nodes, "a", "right")).toBe("b");
    expect(pickNeighbor(nodes, "b", "left")).toBe("a");
  });
});
