import { Injectable, NotFoundException } from "@nestjs/common";
import { type FormSchema, migrate } from "@org/form-schema";
import { SEED_OWNER_ID } from "../../common/constants.js";
import { assertId } from "../../common/file-store.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FormRepo } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectRepo } from "../../persistence/repositories/project.repo.js";

/**
 * The server is the source of truth: every saved body is run through `migrate` (which
 * validates via formSchema.parse and throws on invalid), so only normalized, current-version
 * JSON is ever persisted. Persistence lives behind {@link FormRepo}; forms with no explicit
 * project are adopted into the owner's "Unfiled" project (W0).
 */
@Injectable()
export class FormsService {
  constructor(
    private readonly forms: FormRepo,
    private readonly projects: ProjectRepo,
  ) {}

  async save(body: unknown): Promise<FormSchema> {
    const form = migrate(body); // validates + normalizes to CURRENT_FORM_VERSION
    assertId(form.id, "form");
    const project = await this.projects.ensureUnfiled(SEED_OWNER_ID);
    return this.forms.upsert(form, { projectId: project.id });
  }

  async load(id: string): Promise<FormSchema> {
    assertId(id, "form");
    const form = await this.forms.load(id);
    if (!form) throw new NotFoundException(`Form not found: ${id}`);
    return form;
  }
}
