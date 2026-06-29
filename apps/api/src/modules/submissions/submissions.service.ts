import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { buildZodSchema, maskData } from "@org/form-core";
import { type FormSchema, migrate, type Submission } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormVersionRepo } from "../../persistence/repositories/form-version.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import type { SubmissionSummary } from "../../persistence/repositories/submission.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { SubmissionRepo } from "../../persistence/repositories/submission.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/** Input to record a submission against a form. */
export interface SubmitOptions {
  data: Record<string, unknown>;
  /** Domain roles the submitter declares (FS2); the actor's project role is merged in. Drives
   *  field-level RBAC so fields the submitter can't view are stripped server-side before storage. */
  roles?: string[];
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
    private readonly versions: FormVersionRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Validate `data` against the form server-side and store the (stripped) answer. The snapshot the
   *  data is validated against and pinned to is the form's active PUBLISHED version when one exists
   *  (FB1); a form that was never published falls back to its current draft (FS1 behavior). */
  async submit(ownerId: string, formId: string, opts: SubmitOptions): Promise<Submission> {
    const summary = await this.requireFormAccess(ownerId, formId, "viewer");
    const snapshot = await this.resolveSnapshot(formId);

    // Field-level RBAC (FS2): fields the submitter can't view are excluded from the validation
    // shape, so the server never stores answers the client wasn't allowed to set.
    const roles = await this.actorRoles(ownerId, summary.projectId, opts.roles);
    const schema = buildZodSchema(snapshot, { values: opts.data, access: { roles } });
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

  /** Load a single submission by id (read ⇒ requires `viewer`). Fields the reader can't view are
   *  masked server-side (FS2), against the submission's PINNED snapshot so masking is stable as the
   *  live form changes. `roles` are the reader's declared domain roles; the project role is merged. */
  async load(ownerId: string, id: string, declaredRoles?: string[]): Promise<Submission> {
    const summary = await this.requireSubmissionAccess(ownerId, id, "viewer");
    const submission = await this.submissions.load(id);
    if (!submission) throw new NotFoundException(`Submission not found: ${id}`);
    const roles = await this.actorRoles(ownerId, summary.projectId, declaredRoles);
    return { ...submission, data: maskData(submission.schemaSnapshot, submission.data, { roles }) };
  }

  /** List a form's submissions (summaries, no body) (read ⇒ requires `viewer`). */
  async list(ownerId: string, formId: string): Promise<SubmissionSummary[]> {
    await this.requireFormAccess(ownerId, formId, "viewer");
    return this.submissions.listByForm(formId);
  }

  /** The migrated form to validate + pin a submission against: the active published version (FB1)
   *  when the form has one, else the current draft (FS1 fallback). Throws 404 if neither exists. */
  private async resolveSnapshot(formId: string): Promise<FormSchema> {
    const active = await this.versions.loadActive(formId);
    if (active) return migrate(active.body); // re-normalize the frozen snapshot
    const draft = await this.forms.load(formId);
    if (!draft) throw new NotFoundException(`Form not found: ${formId}`);
    return migrate(draft); // normalize to CURRENT_FORM_VERSION (pinned)
  }

  /** Field-level RBAC roles for the actor: the roles they self-declare plus their project role
   *  (owner|editor|viewer), mirroring the workflow runtime. Empty unless a field gates on them. */
  private async actorRoles(
    ownerId: string,
    projectId: string,
    declared: string[] | undefined,
  ): Promise<string[]> {
    const role = await this.projectsService.resolveRole(ownerId, projectId);
    return [...(declared ?? []), ...(role ? [role] : [])];
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
