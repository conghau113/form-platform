import { z } from "zod";

/**
 * The CURRENT theme-token format version.
 * IMPORTANT: decoupled from the npm package version, exactly like
 * CURRENT_FORM_VERSION. Bump this ONLY when the token JSON shape changes,
 * and add a migration in migrate.ts so older saved themes keep loading.
 */
export const CURRENT_THEME_VERSION = 1 as const;

/** Which antd seed algorithm to derive the palette from. */
export const themeAlgorithmSchema = z.enum(["default", "dark"]);
export type ThemeAlgorithm = z.infer<typeof themeAlgorithmSchema>;

/**
 * Platform-neutral design tokens. These describe intent (a primary color, a
 * corner radius, a base spacing/typography) WITHOUT naming any UI library.
 * Each renderer maps them to its own theme system — `toAntdTheme` for web here,
 * a future native mapper for React Native — so the contract stays portable.
 */
export const designTokensSchema = z.object({
  themeVersion: z.number().int(),
  algorithm: themeAlgorithmSchema,
  colors: z.object({
    primary: z.string().min(1),
  }),
  radius: z.number().int().min(0),
  spacing: z.number().int().min(0),
  typography: z.object({
    fontSize: z.number().int().min(1),
    fontFamily: z.string().optional(),
  }),
});

export type DesignTokens = z.infer<typeof designTokensSchema>;

/** Sensible starting point — antd's own defaults expressed as neutral tokens. */
export const DEFAULT_TOKENS: DesignTokens = {
  themeVersion: CURRENT_THEME_VERSION,
  algorithm: "default",
  colors: { primary: "#1677ff" },
  radius: 6,
  spacing: 16,
  typography: { fontSize: 14 },
};
