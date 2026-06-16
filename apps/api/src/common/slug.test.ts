import { describe, expect, it } from "vitest";
import { ensureUniqueSlug, slugify } from "./slug.js";

describe("slugify", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slugify("HR Platform")).toBe("hr-platform");
    expect(slugify("  Sales / CRM!! ")).toBe("sales-crm");
  });

  it("collapses runs and trims edge dashes", () => {
    expect(slugify("a---b")).toBe("a-b");
    expect(slugify("--edge--")).toBe("edge");
  });

  it("falls back to 'project' when nothing survives", () => {
    expect(slugify("！！！")).toBe("project");
    expect(slugify("")).toBe("project");
  });
});

describe("ensureUniqueSlug", () => {
  it("returns the base when free", () => {
    expect(ensureUniqueSlug("hr", [])).toBe("hr");
    expect(ensureUniqueSlug("hr", ["sales"])).toBe("hr");
  });

  it("appends the first free numeric suffix", () => {
    expect(ensureUniqueSlug("hr", ["hr"])).toBe("hr-2");
    expect(ensureUniqueSlug("hr", ["hr", "hr-2", "hr-3"])).toBe("hr-4");
  });
});
