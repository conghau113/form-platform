import { CURRENT_THEME_VERSION, type DesignTokens, designTokensSchema } from "./tokens.js";

type Migration = (doc: any) => any;

/**
 * Theme migration chain. Mirrors form-schema's migrate(): each entry upgrades a
 * token document from version N to N+1, so any older saved theme JSON can be
 * brought to the current shape before it is applied. Empty today (v1 is the
 * first format) — add steps here when the token shape evolves.
 */
const migrations: Record<number, Migration> = {};

/** Migrate raw theme JSON of any supported version up to the current shape, then validate. */
export function migrateTheme(input: unknown): DesignTokens {
  let doc: any = structuredClone(input);
  if (typeof doc?.themeVersion !== "number") {
    throw new Error("Invalid theme document: missing numeric `themeVersion`.");
  }
  if (doc.themeVersion > CURRENT_THEME_VERSION) {
    throw new Error(
      `Theme v${doc.themeVersion} is newer than this build supports ` +
        `(v${CURRENT_THEME_VERSION}). Upgrade @org/form-theme to read it.`,
    );
  }
  while (doc.themeVersion < CURRENT_THEME_VERSION) {
    const step = migrations[doc.themeVersion];
    if (!step) throw new Error(`No theme migration registered from v${doc.themeVersion}.`);
    doc = step(doc);
  }
  return designTokensSchema.parse(doc);
}
