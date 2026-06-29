import { BadRequestException, Controller, Get, Param, Post } from "@nestjs/common";
import type { FormSchema, FormVersion } from "@org/form-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { FormVersionSummary } from "../../persistence/repositories/form-version.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { FormVersionsService } from "./form-versions.service.js";

/**
 * Form draft/publish/version endpoints (FB1), nested under their form. Routes are more specific than
 * {@link FormsController}'s `GET /forms/:id` so they aren't captured by it. Reads gate on `viewer`,
 * writes on `editor` (enforced in the service).
 */
@Controller("forms")
export class FormVersionsController {
  constructor(private readonly versions: FormVersionsService) {}

  /** Freeze the current draft into a new immutable published version. */
  @Post(":id/publish")
  publish(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<FormVersionSummary> {
    return this.versions.publish(ownerId, id);
  }

  /** List a form's published versions (summaries, no body), newest first. */
  @Get(":id/versions")
  list(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<FormVersionSummary[]> {
    return this.versions.listVersions(ownerId, id);
  }

  /** The form's active published version (with body), or `null`/empty when never published. Distinct
   *  path from `:id/versions/:version` (no param capture). Powers the editor publish badge + diff. */
  @Get(":id/active-version")
  active(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<FormVersion | null> {
    return this.versions.loadActiveVersion(ownerId, id);
  }

  /** Load one published version (with its frozen body) by sequence number. */
  @Get(":id/versions/:version")
  getOne(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Param("version") version: string,
  ): Promise<FormVersion> {
    return this.versions.getVersion(ownerId, id, parseVersion(version));
  }

  /** Roll a past version back into the editable draft (returns the new draft). */
  @Post(":id/versions/:version/clone-draft")
  cloneDraft(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Param("version") version: string,
  ): Promise<FormSchema> {
    return this.versions.cloneDraft(ownerId, id, parseVersion(version));
  }
}

/** Parse a `:version` path param into a positive integer (invalid ⇒ 400). */
function parseVersion(version: string): number {
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestException(`Invalid version: ${version}`);
  }
  return n;
}
