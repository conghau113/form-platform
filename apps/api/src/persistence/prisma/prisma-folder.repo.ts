import { Injectable } from "@nestjs/common";
import type { Folder } from "@prisma/client";
import {
  type FolderChildCounts,
  type FolderCreateInput,
  type FolderRecord,
  FolderRepo,
  type FolderUpdateInput,
} from "../repositories/folder.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference.
import { PrismaService } from "./prisma.service.js";

function toRecord(f: Folder): FolderRecord {
  return {
    id: f.id,
    projectId: f.projectId,
    parentId: f.parentId,
    name: f.name,
    order: f.order,
    createdAt: f.createdAt,
  };
}

@Injectable()
export class PrismaFolderRepo extends FolderRepo {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: FolderCreateInput): Promise<FolderRecord> {
    const folder = await this.prisma.folder.create({
      data: {
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        name: input.name,
        order: input.order ?? 0,
      },
    });
    return toRecord(folder);
  }

  async list(projectId: string): Promise<FolderRecord[]> {
    const folders = await this.prisma.folder.findMany({
      where: { projectId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return folders.map(toRecord);
  }

  async findById(id: string): Promise<FolderRecord | null> {
    const folder = await this.prisma.folder.findUnique({ where: { id } });
    return folder ? toRecord(folder) : null;
  }

  async update(id: string, patch: FolderUpdateInput): Promise<FolderRecord> {
    const folder = await this.prisma.folder.update({
      where: { id },
      data: { name: patch.name, parentId: patch.parentId, order: patch.order },
    });
    return toRecord(folder);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.folder.delete({ where: { id } });
  }

  async countChildren(folderId: string): Promise<FolderChildCounts> {
    const [folders, forms] = await Promise.all([
      this.prisma.folder.count({ where: { parentId: folderId } }),
      this.prisma.formRecord.count({ where: { folderId } }),
    ]);
    return { folders, forms };
  }
}
