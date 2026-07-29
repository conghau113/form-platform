import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
} from "@nestjs/common";
import type { WorkflowInstance } from "@org/workflow-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { WorkflowInstanceSummary } from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AdvanceInstanceDto } from "./dto/advance-instance.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AssignInstanceDto } from "./dto/assign-instance.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { StartInstanceDto } from "./dto/start-instance.dto.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { WorkflowInstancesService } from "./workflow-instances.service.js";

/**
 * Workflow runtime endpoints (WF3). Cases nest under their workflow for create/list; a single case
 * is addressed by its own id under `/workflow-instances` (a separate static prefix so it can't be
 * captured by {@link WorkflowsController}'s `GET /workflows/:id`). Engine failures (invalid graph,
 * no transition, guard/role denied) surface as 422 from the service.
 */
@Controller()
export class WorkflowInstancesController {
  constructor(private readonly instances: WorkflowInstancesService) {}

  /** Start a fresh case of a workflow at its start node. */
  @Post("workflows/:workflowId/instances")
  async start(
    @CurrentOwner() ownerId: string,
    @Param("workflowId") workflowId: string,
    @Body() dto: StartInstanceDto,
  ): Promise<WorkflowInstance> {
    try {
      return await this.instances.start(ownerId, workflowId, { id: dto.id, data: dto.data });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }

  /** List a workflow's cases (summaries, no body). */
  @Get("workflows/:workflowId/instances")
  list(
    @CurrentOwner() ownerId: string,
    @Param("workflowId") workflowId: string,
  ): Promise<WorkflowInstanceSummary[]> {
    return this.instances.list(ownerId, workflowId);
  }

  /** Load a single running case by id → 404 if missing or not accessible. */
  @Get("workflow-instances/:instanceId")
  findOne(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
  ): Promise<WorkflowInstance> {
    return this.instances.load(ownerId, instanceId);
  }

  /** Make a tenant member responsible for the case (`assigneeId: null` unassigns) — Phase E. */
  @Post("workflow-instances/:instanceId/assign")
  assign(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
    @Body() dto: AssignInstanceDto,
  ): Promise<WorkflowInstanceSummary> {
    return this.instances.assign(ownerId, instanceId, dto.assigneeId);
  }

  /** Fire an action against a case; returns the advanced instance or 422 with the failure reason. */
  @Post("workflow-instances/:instanceId/advance")
  async advance(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
    @Body() dto: AdvanceInstanceDto,
  ): Promise<WorkflowInstance> {
    try {
      return await this.instances.advance(ownerId, instanceId, {
        action: dto.action,
        data: dto.data,
        roles: dto.roles,
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }
}
