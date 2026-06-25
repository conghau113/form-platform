import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type { StatusCatalogEntry } from "@org/workflow-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { StatusCatalogService } from "./status-catalog.service.js";

@Controller("status-catalog")
export class StatusCatalogController {
  constructor(private readonly catalog: StatusCatalogService) {}

  /** List the owner's global statuses, plus one project's statuses when `?projectId=` is given. */
  @Get()
  findAll(
    @CurrentOwner() ownerId: string,
    @Query("projectId") projectId?: string,
  ): Promise<StatusCatalogEntry[]> {
    return this.catalog.list(ownerId, projectId);
  }

  /** Save (upsert) a status entry. Body is validated server-side; invalid → 400. */
  @Post()
  async create(
    @CurrentOwner() ownerId: string,
    @Body() body: unknown,
  ): Promise<StatusCatalogEntry> {
    try {
      return await this.catalog.save(ownerId, body);
    } catch (err) {
      // Ownership conflicts (409) keep their status; only validation failures → 400.
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Promote a project status to global → 404 if missing. */
  @Post(":code/promote")
  promote(
    @CurrentOwner() ownerId: string,
    @Param("code") code: string,
  ): Promise<StatusCatalogEntry> {
    return this.catalog.promote(ownerId, code);
  }

  /** Delete a status by code → 404 if missing. */
  @Delete(":code")
  @HttpCode(204)
  remove(@CurrentOwner() ownerId: string, @Param("code") code: string): Promise<void> {
    return this.catalog.remove(ownerId, code);
  }
}
