import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import type { FormSchema } from "@org/form-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { FormSummary } from "../../persistence/repositories/form.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { FormsService } from "./forms.service.js";

interface MoveFormDto {
  folderId?: string | null;
}

@Controller("forms")
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  /**
   * Save a form. Body is the pure form contract (validated server-side; invalid → 400). Optional
   * `?projectId=&folderId=` place it in the workspace; without them an existing form keeps its
   * placement and a new form lands in "Unfiled" (back-compatible with the current builder).
   */
  @Post()
  async create(
    @CurrentOwner() ownerId: string,
    @Body() body: unknown,
    @Query("projectId") projectId?: string,
    @Query("folderId") folderId?: string,
  ): Promise<FormSchema> {
    try {
      return await this.forms.save(body, { ownerId, projectId, folderId });
    } catch (err) {
      // Ownership/placement errors keep their status (404/400); only `migrate()` validation
      // failures (plain Errors) are surfaced as 400.
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** List form summaries (no body) for a project, optionally one folder. */
  @Get()
  list(
    @CurrentOwner() ownerId: string,
    @Query("projectId") projectId: string,
    @Query("folderId") folderId?: string,
  ): Promise<FormSummary[]> {
    if (!projectId) throw new BadRequestException("projectId query param is required");
    return this.forms.list(ownerId, projectId, folderId);
  }

  /** Load a previously saved form by id → 404 if missing or not owned. */
  @Get(":id")
  findOne(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<FormSchema> {
    return this.forms.load(ownerId, id);
  }

  /** Move a form to another folder (`folderId: null` → project root). */
  @Patch(":id/move")
  move(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Body() dto: MoveFormDto,
  ): Promise<FormSummary> {
    return this.forms.move(ownerId, id, dto.folderId ?? null);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<void> {
    return this.forms.remove(ownerId, id);
  }
}
