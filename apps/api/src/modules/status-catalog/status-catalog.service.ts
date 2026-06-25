import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  parseStatusCatalogEntry,
  type StatusCatalogEntry,
  type StatusCatalogScope,
} from "@org/workflow-schema";
import { assertId } from "../../common/file-store.js";
import type { ProjectRole } from "../../persistence/repositories/project-member.repo.js";
import type { StatusCatalogMeta } from "../../persistence/repositories/status-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { StatusCatalogRepo } from "../../persistence/repositories/status-catalog.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";

/**
 * Workflow status catalog store (WE4), sibling to PresetsService and built from the same W3
 * scope/ownership rules: an entry is global (every project) or scoped to one project; the catalog a
 * project sees is `userGlobals ∪ thisProject`. The server is the source of truth: every saved body
 * runs through `parseStatusCatalogEntry` (validate, incl. the scope/projectId invariant) before it
 * reaches the repo.
 *
 * Project entries are a *shared* project library: reads gate on `viewer`, writes on `editor`, and
 * the row is stored under the *project owner* so every collaborator sees the same catalog. Global
 * entries stay personal to their owner. Routing through {@link ProjectsService} gives every
 * collaborator the same shared catalog the workflow editor resolves node colours against.
 */
@Injectable()
export class StatusCatalogService {
  constructor(
    private readonly catalog: StatusCatalogRepo,
    private readonly projects: ProjectsService,
  ) {}

  /** The user's global entries, plus `projectId`'s shared entries when given (viewer gate). */
  async list(userId: string, projectId?: string): Promise<StatusCatalogEntry[]> {
    if (!projectId) return this.catalog.list(userId);
    const project = await this.projects.requireAccess(userId, projectId, "viewer");
    return this.catalog.list(userId, { id: project.id, ownerId: project.ownerId });
  }

  /** Validate and upsert an entry. A project entry needs `editor` and is stored under the project
   *  owner (shared library); a global entry is personal to the user. A code already held by a
   *  different effective owner → 409 (codes are a global PK; never silently overwrite another's). */
  async save(userId: string, body: unknown): Promise<StatusCatalogEntry> {
    const entry = parseStatusCatalogEntry(body); // validates; throws on invalid
    const ownerId = await this.scopeOwner(userId, entry.scope, entry.projectId ?? null, "editor");
    const existing = await this.catalog.findMeta(entry.code);
    if (existing && existing.ownerId !== ownerId) {
      throw new ConflictException(`Status code already in use: ${entry.code}`);
    }
    return this.catalog.upsert(ownerId, entry);
  }

  /** Remove an entry by code (editor on a project entry; the owner of a global one) → 404 if absent. */
  async remove(userId: string, code: string): Promise<void> {
    assertId(code, "status");
    const meta = await this.catalog.findMeta(code);
    if (!meta) throw new NotFoundException(`Status not found: ${code}`);
    const ownerId = await this.metaOwner(userId, meta, "editor");
    const removed = await this.catalog.remove(ownerId, code);
    if (!removed) throw new NotFoundException(`Status not found: ${code}`);
  }

  /** Promote a project entry to global → 404 if absent. */
  async promote(userId: string, code: string): Promise<StatusCatalogEntry> {
    assertId(code, "status");
    const meta = await this.catalog.findMeta(code);
    if (!meta) throw new NotFoundException(`Status not found: ${code}`);
    const ownerId = await this.metaOwner(userId, meta, "owner");
    const promoted = await this.catalog.promote(ownerId, code);
    if (!promoted) throw new NotFoundException(`Status not found: ${code}`);
    return promoted;
  }

  /** Effective owner for a *new* entry from its body: the project owner (gated) or the user. */
  private async scopeOwner(
    userId: string,
    scope: StatusCatalogScope | undefined,
    projectId: string | null,
    minRole: ProjectRole,
  ): Promise<string> {
    if (scope === "project" && projectId) {
      const project = await this.projects.requireAccess(userId, projectId, minRole);
      return project.ownerId;
    }
    return userId;
  }

  /** Effective owner for an *existing* entry row: the project owner (gated) or the user (who must
   *  own a global entry, else 404 — no cross-owner leak). */
  private async metaOwner(
    userId: string,
    meta: StatusCatalogMeta,
    minRole: ProjectRole,
  ): Promise<string> {
    if (meta.scope === "project" && meta.projectId) {
      const project = await this.projects.requireAccess(userId, meta.projectId, minRole);
      return project.ownerId;
    }
    if (meta.ownerId !== userId) throw new NotFoundException("Status not found");
    return userId;
  }
}
