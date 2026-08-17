import type { ThrottlerStorage } from "@nestjs/throttler";

/**
 * The four numbers the guard reads back. Declared here rather than imported: the library exports
 * `ThrottlerStorageRecord` from its own module but not from its entry point, and `implements
 * ThrottlerStorage` below still checks this shape against theirs.
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Counter store behind the global `ThrottlerGuard` (P6).
 *
 * The shipped `ThrottlerStorageService` is replaced rather than extended, for two measured reasons —
 * both of which only became load-bearing once `/external/*` started counting per API key
 * (`modules/external/external-throttle.ts`), because that tracker is derived from a header the
 * caller chooses:
 *
 * 1. **It never forgets a key.** Its map has no `delete` anywhere, so one entry survives for the
 *    process's lifetime per distinct tracker. Measured: 50 000 invented keys ⇒ 50 000 entries and
 *    30 MB. With an IP-derived tracker that was bounded by the number of source addresses; with a
 *    header-derived one it is bounded by the number of *requests*, which is not a bound.
 * 2. **Its expiry bookkeeping is per throttler NAME, not per key.** One key hitting its limit clears
 *    the pending decrements of every other key in the same throttler, and those hits then never
 *    expire — measured: a second key sitting well under its limit stayed at its accumulated count
 *    across four idle windows and was blocked on its next call. Budgets that leak into each other
 *    are exactly what a per-key limit is for.
 *
 * What replaces it is a **fixed window**: a key's count resets when its window ends, instead of each
 * hit decaying on its own timer. That is a deliberate, visible difference — a caller can spend the
 * whole budget at the end of one window and again at the start of the next — and it buys arithmetic
 * with no timers at all, so nothing can leak between keys and nothing has to be cleaned up on
 * shutdown. `X-RateLimit-Reset` tells the caller exactly when their window turns over.
 */
interface Entry {
  /** Hits inside the current window. */
  hits: number;
  /** Epoch ms at which the current window ends and `hits` resets. */
  windowEndsAt: number;
  /** Epoch ms until which the key is blocked; `0` = not blocked. */
  blockedUntil: number;
}

/** Enough for every credential and source address a single instance realistically sees, small enough
 *  that a flood of invented keys costs a bounded amount of memory (~700 bytes per entry). */
const DEFAULT_MAX_ENTRIES = 10_000;

export class BoundedThrottlerStorage implements ThrottlerStorage {
  /** Insertion-ordered, which is what makes the eviction below "oldest first" without a second
   *  structure: re-inserting on every write moves a live key to the back. */
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  /** Number of tracked counters — the thing the cap is about. Exposed for tests, not for callers. */
  get size(): number {
    return this.entries.size;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    // Namespaced by throttler: two throttlers may legitimately track the same string (an IP under
    // `default` and under `external-ip`) and must not share a counter.
    const id = `${throttlerName}|${key}`;

    const existing = this.entries.get(id);
    const entry: Entry =
      existing === undefined || now >= existing.windowEndsAt
        ? { hits: 0, windowEndsAt: now + ttl, blockedUntil: existing?.blockedUntil ?? 0 }
        : existing;

    if (entry.blockedUntil > now) {
      // Already blocked: do not count the request. Otherwise a caller that keeps hammering while
      // blocked would extend nothing but the counter, and the block window would be the only thing
      // that ever ends.
      this.remember(id, entry);
      return {
        totalHits: entry.hits,
        timeToExpire: secondsUntil(entry.windowEndsAt, now),
        isBlocked: true,
        timeToBlockExpire: secondsUntil(entry.blockedUntil, now),
      };
    }

    entry.blockedUntil = 0;
    entry.hits += 1;
    const isBlocked = entry.hits > limit;
    if (isBlocked) entry.blockedUntil = now + blockDuration;
    this.remember(id, entry);

    return {
      totalHits: entry.hits,
      timeToExpire: secondsUntil(entry.windowEndsAt, now),
      isBlocked,
      timeToBlockExpire: isBlocked ? secondsUntil(entry.blockedUntil, now) : 0,
    };
  }

  /**
   * Store the entry and keep the map under its cap.
   *
   * Eviction drops the least recently touched counters. That does hand a flooding caller a fresh
   * budget once they have pushed everything else out — which is why the per-IP ceiling exists
   * alongside the per-key one: that ceiling is a single hot entry per address and stays at the back
   * of the queue, so it keeps counting while invented keys churn through the front.
   */
  private remember(id: string, entry: Entry): void {
    this.entries.delete(id);
    this.entries.set(id, entry);
    if (this.entries.size <= this.maxEntries) return;

    const now = Date.now();
    for (const [candidate, value] of this.entries) {
      if (this.entries.size <= this.maxEntries) break;
      if (candidate === id) continue;
      // Prefer counters that are doing nothing: window over and not blocked.
      if (now >= value.windowEndsAt && value.blockedUntil <= now) this.entries.delete(candidate);
    }
    for (const candidate of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      if (candidate !== id) this.entries.delete(candidate);
    }
  }
}

/** Whole seconds until `deadline`, never negative — the unit the guard puts in `Retry-After`. */
function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
