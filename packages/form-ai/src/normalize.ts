import { CURRENT_FORM_VERSION, type FormSchema, migrate } from "@org/form-schema";
import { ZodError } from "zod";

/**
 * Turn an LLM-authored draft into a contract-valid `FormSchema`, or structured
 * errors. Mirrors the MCP `normalizeForm` helper (stamp version → migrate → Zod
 * parse) — the "output guaranteed valid (Zod), safe to run (no-eval)" promise.
 * The pipeline feeds these errors back to the model for a repair round.
 */
export type NormalizeFormResult = { ok: true; value: FormSchema } | { ok: false; errors: string[] };

/** Flatten any thrown error (ZodError or otherwise) into human-readable lines. */
export function formErrorLines(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}

/** Stamp the current `formVersion` onto a draft that omits it, so the model can
 *  author the body and let the contract own versioning. Non-objects pass through
 *  to let `migrate` report a precise error. */
function withFormVersion(draft: unknown): unknown {
  if (draft !== null && typeof draft === "object" && !Array.isArray(draft)) {
    const obj = draft as Record<string, unknown>;
    if (typeof obj.formVersion !== "number") {
      return { ...obj, formVersion: CURRENT_FORM_VERSION };
    }
  }
  return draft;
}

/** Validate & normalize a form draft into a guaranteed-valid `FormSchema`. */
export function normalizeFormDraft(draft: unknown): NormalizeFormResult {
  try {
    return { ok: true, value: migrate(withFormVersion(draft)) };
  } catch (error) {
    return { ok: false, errors: formErrorLines(error) };
  }
}
