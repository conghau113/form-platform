import { describe, expect, it } from "vitest";
import { boxesIntersect, edgeScroll, normalizeBox, springLoadTarget } from "./geometry";

// Moved out of DesignCanvas.test.tsx (R2): pure canvas geometry, no React/layout needed.

describe("canvas geometry", () => {
  it("computes edge auto-scroll deltas only inside the edge band (D3)", () => {
    const rect = { top: 0, bottom: 600, left: 0, right: 800 };
    // Comfortably inside → no scroll.
    expect(edgeScroll({ x: 400, y: 300 }, rect, 56, 20)).toEqual({ dx: 0, dy: 0 });
    // Near the top edge → scroll up (negative dy), ramped (not yet max).
    const up = edgeScroll({ x: 400, y: 10 }, rect, 56, 20);
    expect(up.dy).toBeLessThan(0);
    expect(up.dy).toBeGreaterThan(-20);
    // At/over the bottom edge → scroll down at max speed.
    expect(edgeScroll({ x: 400, y: 600 }, rect, 56, 20).dy).toBe(20);
    // Past the right edge → max rightward scroll, clamped.
    expect(edgeScroll({ x: 900, y: 300 }, rect, 56, 20).dx).toBe(20);
  });

  it("normalizes corner points and tests box intersection (D7)", () => {
    expect(normalizeBox({ x: 10, y: 20 }, { x: 0, y: 5 })).toEqual({
      left: 0,
      top: 5,
      right: 10,
      bottom: 20,
    });
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(boxesIntersect(a, { left: 5, top: 5, right: 15, bottom: 15 })).toBe(true);
    expect(boxesIntersect(a, { left: 20, top: 20, right: 30, bottom: 30 })).toBe(false);
  });

  it("spring-loads only CLOSED tab/collapse headers (D4)", () => {
    const make = (html: string) => {
      const root = document.createElement("div");
      root.innerHTML = html;
      return root.firstElementChild as HTMLElement;
    };
    // Inactive tab → springs; active tab → no.
    const inactiveTab = make('<div class="ant-tabs-tab"><span>T</span></div>');
    expect(springLoadTarget(inactiveTab.querySelector("span"))).toBe(inactiveTab);
    const activeTab = make('<div class="ant-tabs-tab ant-tabs-tab-active"><span>T</span></div>');
    expect(springLoadTarget(activeTab.querySelector("span"))).toBeNull();
    // Collapsed panel header → springs; expanded → no.
    const closed = make(
      '<div class="ant-collapse-item"><div class="ant-collapse-header">H</div></div>',
    );
    expect(springLoadTarget(closed.querySelector(".ant-collapse-header"))).toBe(
      closed.querySelector(".ant-collapse-header"),
    );
    const open = make(
      '<div class="ant-collapse-item ant-collapse-item-active"><div class="ant-collapse-header">H</div></div>',
    );
    expect(springLoadTarget(open.querySelector(".ant-collapse-header"))).toBeNull();
    expect(springLoadTarget(null)).toBeNull();
  });
});
