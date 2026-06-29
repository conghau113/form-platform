import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { type FormSchema, type FormVersion, migrate } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
import type { FormVersionSummary } from "../../persistence/repositories/form-version.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormVersionRepo } from "../../persistence/repositories/form-version.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/**
 * Form draft/publish/version runtime (FB1). The form's editable working copy stays the mutable
 * draft (`FormRecord.body`, owned by {@link FormsService}); this service freezes the draft into
 * immutable, numbered {@link FormVersion} snapshots and lets a past version be rolled back into the
 * draft. The server is the source of truth — `publish` re-`migrate()`s the draft before freezing it.
 * Mirrors {@link SubmissionsService}'s access pattern (resolve the form's project, then gate):
 * read (list/get) requires `viewer`; write (publish/clone-draft) requires `editor`.
 */
@Injectable()
export class FormVersionsService {
  constructor(
    private readonly versions: FormVersionRepo,
    private readonly forms: FormRepo,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Freeze the current draft into a new immutable published version (gate: editor). */
  async publish(ownerId: string, formId: string): Promise<FormVersionSummary> {
    const summary = await this.requireFormAccess(ownerId, formId, "editor");
    const stored = await this.forms.load(formId);
    if (!stored) throw new NotFoundException(`Form not found: ${formId}`);
    const body = migrate(stored); // normalize to CURRENT_FORM_VERSION before freezing
    const frozen = await this.versions.publish({
      id: randomUUID(),
      formId,
      projectId: summary.projectId,
      body,
      publishedBy: ownerId,
      publishedAt: new Date(),
    });
    return toSummary(frozen, summary.projectId);
  }

  /** List a form's published versions (summaries, no body) (gate: viewer). */
  async listVersions(ownerId: string, formId: string): Promise<FormVersionSummary[]> {
    await this.requireFormAccess(ownerId, formId, "viewer");
    return this.versions.listByForm(formId);
  }

  /** Load one published version by sequence number, with its frozen body (gate: viewer). */
  async getVersion(ownerId: string, formId: string, version: number): Promise<FormVersion> {
    await this.requireFormAccess(ownerId, formId, "viewer");
    const found = await this.versions.load(formId, version);
    if (!found) throw new NotFoundException(`Form version not found: ${formId}@${version}`);
    return found;
  }

  /**
   * Roll a past version back into the editable draft (gate: editor): the version's frozen body
   * becomes the current draft (keeping the form's placement). Published versions stay immutable;
   * to re-activate the rolled-back content the caller publishes again (creating a new version).
   */
  async cloneDraft(ownerId: string, formId: string, version: number): Promise<FormSchema> {
    const summary = await this.requireFormAccess(ownerId, formId, "editor");
    const found = await this.versions.load(formId, version);
    if (!found) throw new NotFoundException(`Form version not found: ${formId}@${version}`);
    const body = migrate(found.body); // re-validate/normalize the frozen snapshot
    return this.forms.upsert(body, { projectId: summary.projectId, folderId: summary.folderId });
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
}

/** Project a full {@link FormVersion} down to its summary (drops the body). */
function toSummary(v: FormVersion, projectId: string): FormVersionSummary {
  return {
    id: v.id,
    formId: v.formId,
    projectId,
    version: v.version,
    formVersion: v.formVersion,
    publishedBy: v.publishedBy,
    publishedAt: new Date(v.publishedAt),
  };
}
