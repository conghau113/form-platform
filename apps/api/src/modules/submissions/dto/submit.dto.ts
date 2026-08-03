import { IsObject } from "class-validator";

/**
 * Body for `POST /forms/:formId/submissions`. Only the request envelope is validated here; the
 * `data` itself is re-validated server-side against the form with `@org/form-core` in the service
 * (never trusting the client), and the stripped/validated output is what gets stored.
 *
 * There is deliberately no `roles` here (Phase E3c). The field-level RBAC roles are derived by the
 * server from the submitter's project + workspace roles; a body that could name them would strip
 * nothing and store everything.
 */
export class SubmitDto {
  /** The raw answer keyed by field name; validated against the form server-side. */
  @IsObject()
  data!: Record<string, unknown>;
}
