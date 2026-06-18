/**
 * Pure canvas geometry — drag auto-scroll, spring-load target detection, and marquee box math.
 * Extracted from `DesignCanvas.tsx` (R2) so it can be unit-tested without a layout engine, rAF,
 * or React. No React/antd imports belong here.
 */

/** Auto-scroll (D3): how close (px) to a scroll-container edge the pointer must get before
 *  the canvas starts scrolling, and the max px/frame at the very edge. */
const EDGE_BAND = 56;
const EDGE_MAX_SPEED = 20;

/** Pure edge-scroll math: given the pointer and the scroll viewport rect, return the
 *  per-frame scroll delta. Speed ramps linearly from 0 at the band's inner edge to
 *  `max` at the viewport edge (and clamps beyond). */
export function edgeScroll(
  point: { x: number; y: number },
  rect: { top: number; bottom: number; left: number; right: number },
  band = EDGE_BAND,
  max = EDGE_MAX_SPEED,
): { dx: number; dy: number } {
  const ramp = (over: number) => Math.min(max, (Math.min(over, band) / band) * max);
  let dy = 0;
  if (point.y < rect.top + band) dy = -ramp(rect.top + band - point.y);
  else if (point.y > rect.bottom - band) dy = ramp(point.y - (rect.bottom - band));
  let dx = 0;
  if (point.x < rect.left + band) dx = -ramp(rect.left + band - point.x);
  else if (point.x > rect.right - band) dx = ramp(point.x - (rect.right - band));
  return { dx, dy };
}

/** Given the element under the pointer, return the CLOSED tab/collapse header that should
 *  spring open on dwell, or null. A tab is springable when it isn't the active tab; a
 *  collapse header when its panel isn't currently expanded. (Both render force-rendered
 *  but hidden children, so opening them turns the children into reachable drop targets.) */
export function springLoadTarget(el: Element | null): HTMLElement | null {
  if (!el) return null;
  const tab = el.closest(".ant-tabs-tab");
  if (tab && !tab.classList.contains("ant-tabs-tab-active")) return tab as HTMLElement;
  const header = el.closest(".ant-collapse-header");
  const item = header?.closest(".ant-collapse-item");
  if (header && item && !item.classList.contains("ant-collapse-item-active")) {
    return header as HTMLElement;
  }
  return null;
}

/** A viewport-space rectangle (client coords). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Normalize two corner points into a {@link Box} (marquee, D7). */
export function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/** Axis-aligned rectangle overlap test (marquee hit, D7). */
export function boxesIntersect(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
