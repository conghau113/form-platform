import { describe, expect, it } from "vitest";
import { formatNotificationTime } from "./notification-text";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("formatNotificationTime", () => {
  it("counts in the coarsest unit that still says something", () => {
    expect(formatNotificationTime(ago(5_000), NOW)).toBe("vừa xong");
    expect(formatNotificationTime(ago(3 * 60_000), NOW)).toBe("3 phút trước");
    expect(formatNotificationTime(ago(5 * 3_600_000), NOW)).toBe("5 giờ trước");
    expect(formatNotificationTime(ago(2 * 86_400_000), NOW)).toBe("2 ngày trước");
  });

  it("switches to a date once the count stops being useful", () => {
    expect(formatNotificationTime(ago(30 * 86_400_000), NOW)).toMatch(/2026/);
  });

  it("says 'vừa xong' for a timestamp slightly in the future (clock skew), never a negative", () => {
    expect(formatNotificationTime(ago(-30_000), NOW)).toBe("vừa xong");
  });

  it("renders nothing for an unparseable instant instead of 'Invalid Date'", () => {
    expect(formatNotificationTime("not-a-date", NOW)).toBe("");
  });
});
