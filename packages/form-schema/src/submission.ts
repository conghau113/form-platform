import { z } from "zod";
import { type FormSchema, formSchema } from "./schema.js";

/**
 * A **submission**: one recorded answer to a form. Like {@link Preset}, it is **runtime data,
 * not form JSON** — decoupled from `CURRENT_FORM_VERSION` (its shape can grow without a form
 * migration). The crucial field is `schemaSnapshot`: the exact migrated {@link FormSchema} the
 * data was validated against at submit time. Pinning it means later edits to the form NEVER
 * change how an old submission reads or re-validates (the correctness guarantee for FS1, before
 * a full draft/publish lifecycle exists — see FB1). `formVersion` is a convenience denorm of
 * `schemaSnapshot.formVersion`.
 *
 * The server is the source of truth: a submission is only created after the server re-validates
 * `data` against the form with `@org/form-core` (`buildZodSchema`) — never trusting the client.
 */
export interface Submission {
  /** Stable id (also the storage key). */
  id: string;
  /** The form this answers. */
  formId: string;
  /** `formVersion` of the snapshot the data was validated against (denorm of `schemaSnapshot`). */
  formVersion: number;
  /** The migrated form the data was validated against — frozen so old submissions stay readable. */
  schemaSnapshot: FormSchema;
  /** The validated, stripped answer (hidden/RBAC-excluded fields removed by `buildZodSchema`). */
  data: Record<string, unknown>;
  /** The actor (`x-owner-id`) who submitted. */
  submittedBy: string;
  /** ISO-8601 timestamp of submission. */
  submittedAt: string;
}

/**
 * Validator for the submission envelope. `schemaSnapshot` is validated as a full
 * {@link FormSchema} (it IS a form); `data` is an opaque record (its contents are validated
 * against the snapshot by `form-core`, not here). Mirrors `parsePreset`/`migrate`.
 */
export const submissionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "id must be a simple identifier"),
  formId: z.string().min(1),
  formVersion: z.number().int().nonnegative(),
  schemaSnapshot: formSchema,
  data: z.record(z.string(), z.unknown()),
  submittedBy: z.string().min(1),
  submittedAt: z.string().min(1),
}) satisfies z.ZodType<Submission>;

/** Validate an unknown body as a {@link Submission}; throws on invalid (mirrors `migrate`). */
export function parseSubmission(body: unknown): Submission {
  return submissionSchema.parse(body);
}
