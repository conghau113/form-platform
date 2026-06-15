import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import type { Preset } from "@org/form-schema";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { PresetsService } from "./presets.service.js";

@Controller("presets")
export class PresetsController {
  constructor(private readonly presets: PresetsService) {}

  /** List all saved user presets. */
  @Get()
  findAll(): Preset[] {
    return this.presets.list();
  }

  /** Save (upsert) a preset. Body is validated server-side; invalid → 400. */
  @Post()
  create(@Body() body: unknown): Preset {
    try {
      return this.presets.save(body);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Delete a preset by id → 404 if missing. */
  @Delete(":id")
  remove(@Param("id") id: string): void {
    this.presets.remove(id);
  }
}
