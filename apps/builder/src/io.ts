import { type FormSchema, migrate } from "@org/form-schema";

/* ----------------------------------------------------------------------------
 * io.ts — portable JSON export/import for a form (Phase I). Pure (no React, no
 * DOM) so both the App handlers and tests can drive it. Import reuses the same
 * untrusted-JSON pipeline as the JSON view and backend Load: `migrate` lifts an
 * older `formVersion` and validates with Zod, throwing on bad JSON or a schema
 * that doesn't parse — the caller surfaces the message.
 * ------------------------------------------------------------------------- */

/** Canonical, pretty-printed JSON for a form schema (download payload). */
export function serializeForm(schema: FormSchema): string {
  return JSON.stringify(schema, null, 2);
}

/** Parse + migrate + validate untrusted file text into a current-version schema.
 *  Throws (SyntaxError for bad JSON, ZodError/Error for an invalid document). */
export function parseFormFile(text: string): FormSchema {
  return migrate(JSON.parse(text));
}
