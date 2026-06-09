import { theme as antdTheme } from "antd";
import { describe, expect, it } from "vitest";
import { toAntdTheme } from "./antd.js";
import { DEFAULT_TOKENS } from "./tokens.js";

describe("toAntdTheme", () => {
  it("maps neutral tokens onto antd's token namespace", () => {
    const cfg = toAntdTheme({
      ...DEFAULT_TOKENS,
      colors: { primary: "#ff0000" },
      radius: 12,
      spacing: 20,
      typography: { fontSize: 18, fontFamily: "Inter" },
    });
    expect(cfg.token).toMatchObject({
      colorPrimary: "#ff0000",
      borderRadius: 12,
      padding: 20,
      fontSize: 18,
      fontFamily: "Inter",
    });
  });

  it("selects the default algorithm", () => {
    expect(toAntdTheme({ ...DEFAULT_TOKENS, algorithm: "default" }).algorithm).toBe(
      antdTheme.defaultAlgorithm,
    );
  });

  it("selects the dark algorithm", () => {
    expect(toAntdTheme({ ...DEFAULT_TOKENS, algorithm: "dark" }).algorithm).toBe(
      antdTheme.darkAlgorithm,
    );
  });

  it("omits fontFamily when not provided", () => {
    expect(toAntdTheme(DEFAULT_TOKENS).token).not.toHaveProperty("fontFamily");
  });
});
