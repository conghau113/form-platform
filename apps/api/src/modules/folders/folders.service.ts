import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  FolderRecord,
  FolderUpdateInput,
} from "../../persistence/repositories/folder.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { FolderRepo } from "../../persistence/repositories/folder.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { ProjectsService } from "../projects/projects.service.js";
import { wouldCreateCycle } from "./folder-tree.js";

export interface CreateFolderDto {
  projectId: string;
  parentId?: string | null;
  name: string;
}

export interface UpdateFolderDto {
  name?: string;
  parentId?: string | null;
  order?: number;
}

/**
 * Folder CRUD (Track W, W1; W5 sharing). Access is enforced by resolving the folder's project
 * through {@link ProjectsService.requireAccess} at the `editor` role (404 no-access / 403
 * view-only — every folder mutation is a write). Moves are guarded against
 * cycles ({@link wouldCreateCycle}, 409); deletes are blocked when the folder is non-empty unless
 * `cascade` is set (Prisma cascades sub-folders; forms fall to the project root via SetNull).
 */
@Injectable()
export class FoldersService {
  constructor(
    private readonly folders: FolderRepo,
    private readonly projects: ProjectsService,
  ) {}

  async create(ownerId: string, dto: CreateFolderDto): Promise<FolderRecord> {
    if (!dto.name?.trim()) throw new BadRequestException("Folder name is required");
    await this.projects.requireAccess(ownerId, dto.projectId, "editor"); // 404/403 otherwise
    if (dto.parentId) await this.requireParentInProject(dto.parentId, dto.projectId);
    return this.folders.create({
      projectId: dto.projectId,
      parentId: dto.parentId ?? null,
      name: dto.name.trim(),
    });
  }

  async update(ownerId: string, id: string, dto: UpdateFolderDto): Promise<FolderRecord> {
    const folder = await this.requireOwned(ownerId, id);

    const patch: FolderUpdateInput = { name: dto.name?.trim(), order: dto.order };
    // A move (parentId present in the payload, including explicit null → root).
    if ("parentId" in dto) {
      const parentId = dto.parentId ?? null;
      if (parentId) await this.requireParentInProject(parentId, folder.projectId);
      const siblings = await this.folders.list(folder.projectId);
      if (wouldCreateCycle(siblings, id, parentId)) {
        throw new ConflictException("Move would create a folder cycle");
      }
      patch.parentId = parentId;
    }
    return this.folders.update(id, patch);
  }

  async remove(ownerId: string, id: string, cascade: boolean): Promise<void> {
    await this.requireOwned(ownerId, id);
    if (!cascade) {
      const { folders, forms } = await this.folders.countChildren(id);
      if (folders > 0 || forms > 0) {
        throw new ConflictException(
          `Folder is not empty (${folders} folder(s), ${forms} form(s)); pass ?cascade=true to delete it.`,
        );
      }
    }
    await this.folders.delete(id);
  }

  /** Load a folder and assert the user may edit its project (404 no-access / 403 view-only). */
  private async requireOwned(ownerId: string, id: string): Promise<FolderRecord> {
    const folder = await this.folders.findById(id);
    if (!folder) throw new NotFoundException(`Folder not found: ${id}`);
    await this.projects.requireAccess(ownerId, folder.projectId, "editor");
    return folder;
  }

  /** A parent folder must exist and live in the same project as its child. */
  private async requireParentInProject(parentId: string, projectId: string): Promise<void> {
    const parent = await this.folders.findById(parentId);
    if (!parent || parent.projectId !== projectId) {
      throw new BadRequestException(`Parent folder not in project: ${parentId}`);
    }
  }
}
