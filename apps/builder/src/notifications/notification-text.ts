/**
 * Pure presentation helpers for the notification bell (product-roadmap Phase E3b) — kept out of the
 * component so they are testable without rendering anything, the same split as `operate/priority.ts`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago a notification arrived, in Vietnamese. Coarse on purpose: the feed is scanned, not
 * audited, so "3 giờ trước" is more useful than a timestamp, and anything past a week gets the date
 * instead of an ever-growing count. `now` is a parameter so the test does not depend on the clock.
 */
export function formatNotificationTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const elapsed = now.getTime() - at.getTime();
  // A clock skew between server and browser must not produce "trong -2 phút".
  if (elapsed < MINUTE) return "vừa xong";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} ngày trước`;
  return at.toLocaleDateString("vi-VN");
}

/** Badge text: counts above the cap read as "99+", so the rail never has to widen. */
export const UNREAD_BADGE_CAP = 99;
