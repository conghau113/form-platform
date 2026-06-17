import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { type Preset, type PresetScope, parsePreset } from "@org/form-schema";
import { assertId } from "../../common/file-store.js";
import type { PresetMeta } from "../../persistence/repositories/preset.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PresetRepo } from "../../persistence/repositories/preset.repo.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/**
 * Preset store, sibling to FormsService/ThemesService. Owner- and scope-aware (W3): a preset is
 * global (every project) or scoped to one project; the library a project sees is
 * `userGlobals ∪ thisProject`. The server is the source of truth: every saved body is run through
 * `parsePreset` (validate, incl. the scope/projectId invariant) before it reaches the repo.
 *
 * Project presets are a *shared* project library (W5 follow-up): reads gate on `viewer`, writes on
 * `editor`, and the row is stored under the *project owner* so every collaborator sees the same
 * library. Global presets stay personal to their owner. Routing through {@link ProjectsService}
 * closes the gap where a shared project's presets were invisible to (and unwritable by) its
 * collaborators.
 */
@Injectable()
export class PresetsService {
  constructor(
    private readonly presets: PresetRepo,
    private readonly projects: ProjectsService,
  ) {}

  /** The user's global presets, plus `projectId`'s shared presets when given (viewer gate). */
  async list(userId: string, projectId?: string): Promise<Preset[]> {
    if (!projectId) return this.presets.list(userId);
    const project = await this.projects.requireAccess(userId, projectId, "viewer");
    return this.presets.list(userId, { id: project.id, ownerId: project.ownerId });
  }

  /** Validate and upsert a preset. A project preset needs `editor` and is stored under the project
   *  owner (shared library); a global preset is personal to the user. A preset id already held by a
   *  different effective owner → 409 (ids are a global PK; never silently overwrite another's row). */
  async save(userId: string, body: unknown): Promise<Preset> {
    const preset = parsePreset(body); // validates; throws on invalid
    const ownerId = await this.scopeOwner(userId, preset.scope, preset.projectId ?? null, "editor");
    const existing = await this.presets.findMeta(preset.id);
    if (existing && existing.ownerId !== ownerId) {
      throw new ConflictException(`Preset id already in use: ${preset.id}`);
    }
    return this.presets.upsert(ownerId, preset);
  }

  /** Remove a preset by id (editor on a project preset; the owner of a global one) → 404 if absent. */
  async remove(userId: string, id: string): Promise<void> {
    assertId(id, "preset");
    const meta = await this.presets.findMeta(id);
    if (!meta) throw new NotFoundException(`Preset not found: ${id}`);
    const ownerId = await this.metaOwner(userId, meta, "editor");
    const removed = await this.presets.remove(ownerId, id);
    if (!removed) throw new NotFoundException(`Preset not found: ${id}`);
  }

  /** Promote a project preset to global → 404 if absent. Pulling a shared preset into a global
   *  library is an owner action. */
  async promote(userId: string, id: string): Promise<Preset> {
    assertId(id, "preset");
    const meta = await this.presets.findMeta(id);
    if (!meta) throw new NotFoundException(`Preset not found: ${id}`);
    const ownerId = await this.metaOwner(userId, meta, "owner");
    const promoted = await this.presets.promote(ownerId, id);
    if (!promoted) throw new NotFoundException(`Preset not found: ${id}`);
    return promoted;
  }

  /** Effective owner for a *new* preset from its body: the project owner (gated) or the user. */
  private async scopeOwner(
    userId: string,
    scope: PresetScope | undefined,
    projectId: string | null,
    minRole: ProjectRole,
  ): Promise<string> {
    if (scope === "project" && projectId) {
      const project = await this.projects.requireAccess(userId, projectId, minRole);
      return project.ownerId;
    }
    return userId;
  }

  /** Effective owner for an *existing* preset row: the project owner (gated) or the user (who must
   *  own a global preset, else 404 — no cross-owner leak). */
  private async metaOwner(userId: string, meta: PresetMeta, minRole: ProjectRole): Promise<string> {
    if (meta.scope === "project" && meta.projectId) {
      const project = await this.projects.requireAccess(userId, meta.projectId, minRole);
      return project.ownerId;
    }
    if (meta.ownerId !== userId) throw new NotFoundException("Preset not found");
    return userId;
  }
}
