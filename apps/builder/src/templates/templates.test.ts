import { describe, expect, it, vi } from "vitest";
import { newTemplateId } from "./templates";

describe("newTemplateId", () => {
  it("generates distinct ids for templates saved in the SAME millisecond", () => {
    // The clock is frozen so both calls see one timestamp — the case where a list keyed by id
    // used to hand out one id twice, so removing one entry dropped both.
    vi.useFakeTimers();
    try {
      const a = newTemplateId();
      const b = newTemplateId();
      // Both ids carry the same frozen timestamp — proof the clock really did not move — yet differ.
      expect(a).toMatch(new RegExp(`^user-${Date.now()}-`));
      expect(b).toMatch(new RegExp(`^user-${Date.now()}-`));
      expect(a).not.toBe(b);
    } finally {
      vi.useRealTimers();
    }
  });
});
