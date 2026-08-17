import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoundedThrottlerStorage } from "./throttler-storage.js";

/**
 * P6. Two of these tests exist because the library's own storage fails them — they are the reason
 * this class exists at all, so they are written as the defect, not as a happy path.
 */
const TTL = 60_000;
const LIMIT = 3;
const NAME = "external-key";

async function hit(storage: BoundedThrottlerStorage, key: string) {
  return storage.increment(key, TTL, LIMIT, TTL, NAME);
}

describe("BoundedThrottlerStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts within a window and blocks past the limit", async () => {
    const storage = new BoundedThrottlerStorage();
    for (let i = 0; i < LIMIT; i++) {
      expect((await hit(storage, "a")).isBlocked).toBe(false);
    }
    const blocked = await hit(storage, "a");
    expect(blocked.isBlocked).toBe(true);
    expect(blocked.totalHits).toBe(LIMIT + 1);
    expect(blocked.timeToBlockExpire).toBeGreaterThan(0);
  });

  it("does not count requests made while already blocked", async () => {
    // Otherwise the counter climbs forever under a flood and only the block window ever ends,
    // which makes `totalHits` meaningless in logs.
    const storage = new BoundedThrottlerStorage();
    for (let i = 0; i <= LIMIT; i++) await hit(storage, "a");
    const during = await hit(storage, "a");
    expect(during.totalHits).toBe(LIMIT + 1);
    expect(during.isBlocked).toBe(true);
  });

  it("starts a fresh window once the block expires", async () => {
    const storage = new BoundedThrottlerStorage();
    for (let i = 0; i <= LIMIT; i++) await hit(storage, "a");
    vi.advanceTimersByTime(TTL + 1);

    const after = await hit(storage, "a");
    expect(after.isBlocked).toBe(false);
    expect(after.totalHits).toBe(1);
  });

  it("keeps one key's block out of another key's counter", async () => {
    // 🔴 The defect that motivated this class, reproduced in the order that triggers it: `b`'s hits
    // must still be *pending expiry* at the moment `a`'s block resets. `ThrottlerStorageService`
    // clears its expiry timers by throttler NAME, so that reset takes b's pending decrements with
    // it and b's hits then never expire at all. Measured against the real library storage with this
    // exact sequence: b reports 3 accumulated hits where it should report 1.
    const storage = new BoundedThrottlerStorage();
    for (let i = 0; i <= LIMIT; i++) await hit(storage, "a"); // a is now blocked

    vi.advanceTimersByTime(TTL / 2); // b's hits land mid-window, expiring after a's block ends
    await hit(storage, "b");
    await hit(storage, "b");

    vi.advanceTimersByTime(TTL / 2 + 1); // a's block has ended; b's own window has not
    await hit(storage, "a"); // the reset that used to wipe b's bookkeeping

    vi.advanceTimersByTime(TTL + 1); // b has now been idle through a whole window of its own
    const b = await hit(storage, "b");
    expect(b.totalHits).toBe(1);
    expect(b.isBlocked).toBe(false);
  });

  it("namespaces the same tracker under two throttlers", async () => {
    // A source address is tracked by both `default` and `external-ip`; one budget must not spend
    // the other.
    const storage = new BoundedThrottlerStorage();
    await storage.increment("1.2.3.4", TTL, LIMIT, TTL, "default");
    const other = await storage.increment("1.2.3.4", TTL, LIMIT, TTL, "external-ip");
    expect(other.totalHits).toBe(1);
  });

  it("stays under its cap when a caller invents an endless supply of keys", async () => {
    // 🔴 The second defect: the library's map has no `delete` at all, so a header-derived tracker
    // turns every request into a permanent entry (measured: 50 000 keys ⇒ 30 MB).
    const storage = new BoundedThrottlerStorage(50);
    for (let i = 0; i < 500; i++) await hit(storage, `invented-${i}`);
    expect(storage.size).toBeLessThanOrEqual(50);
  });

  it("keeps counting a hot key while invented ones churn past it", async () => {
    // The property that makes the cap safe: the per-IP ceiling is one entry that is touched by
    // every request, so it survives the churn and keeps bounding the flood.
    const storage = new BoundedThrottlerStorage(50);
    let ip = await storage.increment("192.0.2.9", TTL, 1_000_000, TTL, "external-ip");
    for (let i = 0; i < 500; i++) {
      await hit(storage, `invented-${i}`);
      ip = await storage.increment("192.0.2.9", TTL, 1_000_000, TTL, "external-ip");
    }
    expect(ip.totalHits).toBe(501);
  });

  it("reports the seconds a caller has to wait, not a timestamp", async () => {
    const storage = new BoundedThrottlerStorage();
    const first = await hit(storage, "a");
    expect(first.timeToExpire).toBe(60);
    expect(first.timeToBlockExpire).toBe(0);

    vi.advanceTimersByTime(30_000);
    expect((await hit(storage, "a")).timeToExpire).toBe(30);
  });
});
