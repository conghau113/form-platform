import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { buildZodSchema } from "@org/form-core";
import { type FormSchema, migrate, type Submission } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import type { SubmissionSummary } from "../../persistence/repositories/submission.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { SubmissionRepo } from "../../persistence/repositories/submission.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/** Input to record a submission against a form. */
export interface SubmitOptions {
  data: Record<string, unknown>;
}

/**
 * Form submission runtime (FS1): server-authoritative recording of form answers. The server is the
 * source of truth — every submission is re-validated against the form with `@org/form-core`
 * (`buildZodSchema`), never trusting the client, and the validated output is what gets stored
 * (hidden/visibility-excluded fields are stripped by the schema). Each submission PINS the migrated
 * form it was validated against (`schemaSnapshot`) so later edits to the form never change how an
 * old answer reads or re-validates. Mirrors {@link WorkflowInstancesService}'s access pattern;
 * submit/read both require project `viewer` (FS2 will refine submit/edit/export permissions).
 */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly submissions: SubmissionRepo,
    private readonly forms: FormRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Validate `data` against the form server-side and store the (stripped) answer. */
  async submit(ownerId: string, formId: string, opts: SubmitOptions): Promise<Submission> {
    const summary = await this.requireFormAccess(ownerId, formId, "viewer");
    const stored = await this.forms.load(formId);
    if (!stored) throw new NotFoundException(`Form not found: ${formId}`);
    const snapshot: FormSchema = migrate(stored); // normalize to CURRENT_FORM_VERSION (pinned)

    const schema = buildZodSchema(snapshot, { values: opts.data });
    const result = schema.safeParse(opts.data);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: "Submission failed validation",
        errors: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const submission: Submission = {
      id: randomUUID(),
      formId,
      formVersion: snapshot.formVersion,
      schemaSnapshot: snapshot,
      data: result.data, // validated + stripped of hidden/unknown fields
      submittedBy: ownerId,
      submittedAt: new Date().toISOString(),
    };
    return this.submissions.create(submission, { formId, projectId: summary.projectId });
  }

  /** Load a single submission by id (read ⇒ requires `viewer`). */
  async load(ownerId: string, id: string): Promise<Submission> {
    await this.requireSubmissionAccess(ownerId, id, "viewer");
    const submission = await this.submissions.load(id);
    if (!submission) throw new NotFoundException(`Submission not found: ${id}`);
    return submission;
  }

  /** List a form's submissions (summaries, no body) (read ⇒ requires `viewer`). */
  async list(ownerId: string, formId: string): Promise<SubmissionSummary[]> {
    await this.requireFormAccess(ownerId, formId, "viewer");
    return this.submissions.listByForm(formId);
  }

  /** Resolve a form's project and assert the user holds at least `minRole` on it. */
  private async requireFormAccess(
    ownerId: string,
    formId: string,
    minRole: ProjectRole,
  ): Promise<FormSummary> {
    assertId(formId, "form");
    const summary = await this.forms.findSummary(formId);
    if (!summary) throw new NotFoundException(`Form not found: ${formId}`);
    await this.projectsService.requireAccess(ownerId, summary.projectId, minRole);
    return summary;
  }

  /** Resolve a submission's project and assert the user holds at least `minRole` on it. */
  private async requireSubmissionAccess(
    ownerId: string,
    id: string,
    minRole: ProjectRole,
  ): Promise<SubmissionSummary> {
    assertId(id, "submission");
    const summary = await this.submissions.findSummary(id);
    if (!summary) throw new NotFoundException(`Submission not found: ${id}`);
    await this.projectsService.requireAccess(ownerId, summary.projectId, minRole);
    return summary;
  }
}
