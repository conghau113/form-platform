import { theme as antdTheme, type ThemeConfig } from "antd";
import type { DesignTokens } from "./tokens.js";

/**
 * Map platform-neutral design tokens to an antd ThemeConfig. This is the only
 * antd-specific part of the package; the tokens themselves stay portable so
 * other platforms can provide their own mapper.
 */
export function toAntdTheme(tokens: DesignTokens): ThemeConfig {
  return {
    algorithm: tokens.algorithm === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: tokens.colors.primary,
      borderRadius: tokens.radius,
      padding: tokens.spacing,
      fontSize: tokens.typography.fontSize,
      ...(tokens.typography.fontFamily ? { fontFamily: tokens.typography.fontFamily } : {}),
    },
  };
}
