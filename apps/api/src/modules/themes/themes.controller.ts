import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from "@nestjs/common";
import type { DesignTokens } from "@org/form-theme";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { ThemesService } from "./themes.service.js";

@Controller("themes")
export class ThemesController {
  constructor(private readonly themes: ThemesService) {}

  /** Save a theme for a form id (editor on the form's project). Body validated server-side. */
  @Post(":id")
  async create(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DesignTokens> {
    try {
      return await this.themes.save(ownerId, id, body);
    } catch (err) {
      // Access failures (403/404) keep their status; only validation failures → 400.
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Load a previously saved theme by form id (viewer on the form's project) → 404 if missing. */
  @Get(":id")
  findOne(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<DesignTokens> {
    return this.themes.load(ownerId, id);
  }
}
