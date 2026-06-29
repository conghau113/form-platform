import type { Submission } from "@org/form-schema";

/** Parent links for a submission — denormalised so access control never loads the body. */
export interface SubmissionMeta {
  formId: string;
  projectId: string;
}

/** Cheap org-index of a submission (no body) — list a form's answers without parsing each. */
export interface SubmissionSummary {
  id: string;
  formId: string;
  projectId: string;
  submittedBy: string;
  submittedAt: Date;
}

/**
 * Persistence boundary for submissions (D4: services depend on this interface, never on Prisma).
 * The stored `body` is the `Submission` contract the service produced AFTER server-side validation
 * (`@org/form-core`); the repo only stores/loads it plus the org index — it never validates.
 * Submissions are append-only in FS1 (edit/correct arrives in FS4). Mirrors {@link FormRepo}.
 */
export abstract class SubmissionRepo {
  /** Insert a new submission by `submission.id`; returns the stored contract. */
  abstract create(submission: Submission, meta: SubmissionMeta): Promise<Submission>;
  /** Load a submission by id, or `null` when absent (service maps null → 404). */
  abstract load(id: string): Promise<Submission | null>;
  /** The org-index summary of a submission (no body), or `null` — for access checks. */
  abstract findSummary(id: string): Promise<SubmissionSummary | null>;
  /** List submission summaries for a form, most-recent first. */
  abstract listByForm(formId: string): Promise<SubmissionSummary[]>;
}
