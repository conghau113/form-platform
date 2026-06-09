import { describe, expect, it } from "vitest";
import { migrateTheme } from "./migrate.js";
import { CURRENT_THEME_VERSION, DEFAULT_TOKENS, designTokensSchema } from "./tokens.js";

describe("design tokens", () => {
  it("accepts the default tokens", () => {
    expect(designTokensSchema.parse(DEFAULT_TOKENS)).toEqual(DEFAULT_TOKENS);
    expect(DEFAULT_TOKENS.themeVersion).toBe(CURRENT_THEME_VERSION);
  });

  it("rejects an unknown algorithm", () => {
    expect(() => designTokensSchema.parse({ ...DEFAULT_TOKENS, algorithm: "neon" })).toThrow();
  });

  it("rejects a negative radius", () => {
    expect(() => designTokensSchema.parse({ ...DEFAULT_TOKENS, radius: -1 })).toThrow();
  });
});

describe("migrateTheme", () => {
  it("validates and returns a current-version document unchanged", () => {
    expect(migrateTheme(DEFAULT_TOKENS)).toEqual(DEFAULT_TOKENS);
  });

  it("throws on a missing themeVersion", () => {
    const { themeVersion: _omit, ...rest } = DEFAULT_TOKENS;
    expect(() => migrateTheme(rest)).toThrow(/themeVersion/);
  });

  it("throws on a future version", () => {
    expect(() =>
      migrateTheme({ ...DEFAULT_TOKENS, themeVersion: CURRENT_THEME_VERSION + 1 }),
    ).toThrow(/newer/);
  });
});
