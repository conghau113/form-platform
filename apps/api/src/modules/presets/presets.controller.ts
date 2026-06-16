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
import type { Preset } from "@org/form-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { PresetsService } from "./presets.service.js";

@Controller("presets")
export class PresetsController {
  constructor(private readonly presets: PresetsService) {}

  /** List the owner's global presets, plus one project's presets when `?projectId=` is given. */
  @Get()
  findAll(
    @CurrentOwner() ownerId: string,
    @Query("projectId") projectId?: string,
  ): Promise<Preset[]> {
    return this.presets.list(ownerId, projectId);
  }

  /** Save (upsert) a preset. Body is validated server-side; invalid → 400. */
  @Post()
  async create(@CurrentOwner() ownerId: string, @Body() body: unknown): Promise<Preset> {
    try {
      return await this.presets.save(ownerId, body);
    } catch (err) {
      // Ownership conflicts (409) keep their status; only validation failures → 400.
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Promote a project preset to global → 404 if missing. */
  @Post(":id/promote")
  promote(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<Preset> {
    return this.presets.promote(ownerId, id);
  }

  /** Delete a preset by id → 404 if missing. */
  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<void> {
    return this.presets.remove(ownerId, id);
  }
}
