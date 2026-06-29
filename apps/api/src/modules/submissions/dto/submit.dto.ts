import { IsObject } from "class-validator";

/**
 * Body for `POST /forms/:formId/submissions`. Only the request envelope is validated here; the
 * `data` itself is re-validated server-side against the form with `@org/form-core` in the service
 * (never trusting the client), and the stripped/validated output is what gets stored.
 */
export class SubmitDto {
  /** The raw answer keyed by field name; validated against the form server-side. */
  @IsObject()
  data!: Record<string, unknown>;
}
