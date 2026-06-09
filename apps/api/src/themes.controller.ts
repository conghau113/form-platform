import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { DesignTokens } from "@org/form-theme";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ThemesService } from "./themes.service.js";

@Controller("themes")
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  /** Save a theme for a form id. Body is validated server-side; invalid → 400. */
  @Post(":id")
  create(@Param("id") id: string, @Body() body: unknown): DesignTokens {
    try {
      return this.themes.save(id, body);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Load a previously saved theme by form id → 404 if missing. */
  @Get(":id")
  findOne(@Param("id") id: string): DesignTokens {
    return this.themes.load(id);
  }
}
