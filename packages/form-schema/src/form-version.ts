import { z } from "zod";
import { type FormSchema, formSchema } from "./schema.js";

/**
 * A **form version**: an immutable published snapshot of a form (Track FB1). Like {@link Submission}
 * and {@link Preset}, it is **runtime/governance data, not form JSON** — decoupled from
 * `CURRENT_FORM_VERSION` (its envelope can grow without a form migration). The form's editable
 * working copy stays the mutable draft (`FormRecord.body`); **publishing** freezes the current
 * draft into a numbered, immutable `FormVersion`. Runtime (submission) prefers the active published
 * version, so editing the draft afterwards never changes how a published form is submitted/validated.
 *
 * `version` is the 1-based publish sequence number (per form); `formVersion` is a convenience denorm
 * of `body.formVersion` (the contract version of the snapshot). The server is the source of truth:
 * `body` is always re-`migrate()`d before it is frozen.
 */
export interface FormVersion {
  /** Stable id (also the storage key). */
  id: string;
  /** The form this is a version of. */
  formId: string;
  /** 1-based publish sequence number, incrementing per form. */
  version: number;
  /** `formVersion` of the frozen snapshot (denorm of `body.formVersion`). */
  formVersion: number;
  /** The migrated form, frozen at publish time — immutable. */
  body: FormSchema;
  /** The actor (`x-owner-id`) who published. */
  publishedBy: string;
  /** ISO-8601 timestamp of publication. */
  publishedAt: string;
}

/**
 * Validator for the form-version envelope. `body` is validated as a full {@link FormSchema} (it IS a
 * form); the numeric fields are non-negative integers. Mirrors `submissionSchema`/`parsePreset`.
 */
export const formVersionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "id must be a simple identifier"),
  formId: z.string().min(1),
  version: z.number().int().positive(),
  formVersion: z.number().int().nonnegative(),
  body: formSchema,
  publishedBy: z.string().min(1),
  publishedAt: z.string().min(1),
}) satisfies z.ZodType<FormVersion>;

/** Validate an unknown body as a {@link FormVersion}; throws on invalid (mirrors `migrate`). */
export function parseFormVersion(body: unknown): FormVersion {
  return formVersionSchema.parse(body);
}
