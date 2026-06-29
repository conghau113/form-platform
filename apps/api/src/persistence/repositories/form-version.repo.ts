import type { FormSchema, FormVersion } from "@org/form-schema";

/** Parent links for a version — denormalised so access control never loads the body. */
export interface FormVersionMeta {
  formId: string;
  projectId: string;
}

/** What the service supplies to freeze a new published version (the repo assigns `version`). */
export interface PublishInput {
  id: string;
  formId: string;
  projectId: string;
  /** The migrated draft to freeze. */
  body: FormSchema;
  publishedBy: string;
  publishedAt: Date;
}

/** Cheap org-index of a version (no body) — list a form's history without parsing each snapshot. */
export interface FormVersionSummary {
  id: string;
  formId: string;
  projectId: string;
  version: number;
  formVersion: number;
  publishedBy: string;
  publishedAt: Date;
}

/**
 * Persistence boundary for form versions (D4: services depend on this interface, never on Prisma).
 * Versions are append-only immutable snapshots (FB1). `publish` assigns the next sequence number
 * and updates the parent form's active-version pointer atomically; everything else is read-only.
 * Mirrors {@link SubmissionRepo}.
 */
export abstract class FormVersionRepo {
  /**
   * Freeze a new published version: assign `version = max(existing)+1`, insert the snapshot, and
   * point the parent `FormRecord` at it (`activeVersion`/`publishedAt`) — all in one transaction.
   */
  abstract publish(input: PublishInput): Promise<FormVersion>;
  /** Load the form's currently-active published version, or `null` if it was never published. */
  abstract loadActive(formId: string): Promise<FormVersion | null>;
  /** Load one version (with body) by form + sequence number, or `null` when absent. */
  abstract load(formId: string, version: number): Promise<FormVersion | null>;
  /** List a form's version summaries (no body), most-recent (highest version) first. */
  abstract listByForm(formId: string): Promise<FormVersionSummary[]>;
}
