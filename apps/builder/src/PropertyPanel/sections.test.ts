import { describe, expect, it } from "vitest";
import {
  PANEL_SECTIONS,
  type PanelSectionKey,
  SECTION_KEYWORDS,
  SECTION_LABELS,
  sectionMatches,
} from "./sections";

describe("panel sections metadata", () => {
  it("has a label + keywords for every section key", () => {
    for (const key of PANEL_SECTIONS) {
      expect(SECTION_LABELS[key]).toBeTruthy();
      expect(SECTION_KEYWORDS[key].length).toBeGreaterThan(0);
    }
  });

  it("matches everything on an empty query", () => {
    for (const key of PANEL_SECTIONS) {
      expect(sectionMatches(key, "")).toBe(true);
    }
  });

  it("matches by label", () => {
    expect(sectionMatches("validation", "valid")).toBe(true);
    expect(sectionMatches("permissions", "perm")).toBe(true);
  });

  it("matches by keyword, not just label", () => {
    // "role" only appears as a keyword of Permissions.
    expect(sectionMatches("permissions", "role")).toBe(true);
    expect(sectionMatches("basic", "role")).toBe(false);
    // "colspan" routes to Layout.
    expect(sectionMatches("layout", "colspan")).toBe(true);
    // "reaction" routes to Logic.
    expect(sectionMatches("logic", "reaction")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    const key: PanelSectionKey = "basic";
    expect(sectionMatches(key, "zzzznope")).toBe(false);
  });
});
