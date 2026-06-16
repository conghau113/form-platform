import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { FolderRecord } from "../../persistence/repositories/folder.repo.js";
import type { CreateFolderDto, UpdateFolderDto } from "./folders.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { FoldersService } from "./folders.service.js";

@Controller("folders")
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Post()
  create(@CurrentOwner() ownerId: string, @Body() dto: CreateFolderDto): Promise<FolderRecord> {
    return this.folders.create(ownerId, dto);
  }

  /** Rename / move (`parentId`) / reorder. A move that would loop the tree → 409. */
  @Patch(":id")
  update(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<FolderRecord> {
    return this.folders.update(ownerId, id, dto);
  }

  /** Delete; non-empty → 409 unless `?cascade=true` (sub-folders cascade, forms fall to root). */
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Query("cascade") cascade?: string,
  ): Promise<void> {
    return this.folders.remove(ownerId, id, cascade === "true");
  }
}
