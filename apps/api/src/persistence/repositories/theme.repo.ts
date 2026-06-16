import type { DesignTokens } from "@org/form-theme";

/** Persistence boundary for a form's saved design tokens, keyed by formId. */
export abstract class ThemeRepo {
  /** Load a form's tokens, or `null` when none saved (service maps null → 404). */
  abstract load(formId: string): Promise<DesignTokens | null>;
  /** Upsert tokens for a form; returns the stored tokens. */
  abstract upsert(formId: string, tokens: DesignTokens): Promise<DesignTokens>;
}
