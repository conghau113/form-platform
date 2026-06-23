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
import type { WorkflowDefinition } from "@org/workflow-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { WorkflowSummary } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { MoveWorkflowDto } from "./dto/move-workflow.dto.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { WorkflowsService } from "./workflows.service.js";

@Controller("workflows")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  /**
   * Save a workflow. Body is the pure workflow contract (validated server-side; invalid → 400).
   * Optional `?projectId=&folderId=` place it in the workspace; without them an existing workflow
   * keeps its placement and a new one lands in "Unfiled".
   */
  @Post()
  async create(
    @CurrentOwner() ownerId: string,
    @Body() body: unknown,
    @Query("projectId") projectId?: string,
    @Query("folderId") folderId?: string,
  ): Promise<WorkflowDefinition> {
    try {
      return await this.workflows.save(body, { ownerId, projectId, folderId });
    } catch (err) {
      // Ownership/placement errors keep their status (404/400); only `migrateWorkflow()` validation
      // failures (plain Errors) are surfaced as 400.
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** List workflow summaries (no body) for a project, optionally one folder. */
  @Get()
  list(
    @CurrentOwner() ownerId: string,
    @Query("projectId") projectId: string,
    @Query("folderId") folderId?: string,
  ): Promise<WorkflowSummary[]> {
    if (!projectId) throw new BadRequestException("projectId query param is required");
    return this.workflows.list(ownerId, projectId, folderId);
  }

  /** Load a previously saved workflow by id → 404 if missing or not owned. */
  @Get(":id")
  findOne(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<WorkflowDefinition> {
    return this.workflows.load(ownerId, id);
  }

  /** Move a workflow to another folder (`folderId: null` → project root). */
  @Patch(":id/move")
  move(
    @CurrentOwner() ownerId: string,
    @Param("id") id: string,
    @Body() dto: MoveWorkflowDto,
  ): Promise<WorkflowSummary> {
    return this.workflows.move(ownerId, id, dto.folderId ?? null);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentOwner() ownerId: string, @Param("id") id: string): Promise<void> {
    return this.workflows.remove(ownerId, id);
  }
}
