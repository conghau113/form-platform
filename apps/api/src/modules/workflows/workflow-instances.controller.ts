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
} from "@nestjs/common";
import type { WorkflowInstance } from "@org/workflow-schema";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import type { CaseCommentRecord } from "../../persistence/repositories/case-comment.repo.js";
import type { CaseParticipantRecord } from "../../persistence/repositories/case-participant.repo.js";
import type { WorkflowInstanceSummary } from "../../persistence/repositories/workflow-instance.repo.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { CaseCommentsService } from "./case-comments.service.js";
import type { CaseCastView } from "./case-participants.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { CaseParticipantsService } from "./case-participants.service.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AddCommentDto } from "./dto/add-comment.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AddParticipantDto } from "./dto/add-participant.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AdvanceInstanceDto } from "./dto/advance-instance.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { AssignInstanceDto } from "./dto/assign-instance.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { StartInstanceDto } from "./dto/start-instance.dto.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { UpdateWorkOrderDto } from "./dto/update-work-order.dto.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { WorkflowInstancesService } from "./workflow-instances.service.js";

/**
 * A validated deadline string → `Date` (or `null` to clear). The DTO's pattern already rules out
 * everything `Date` cannot parse; this re-checks anyway, because the alternative to a 400 here is
 * handing an Invalid Date to Prisma, which throws a 500 with no useful message.
 */
function toInstant(value: string | null): Date | null {
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`dueAt is not a valid instant: ${value}`);
  return date;
}

/**
 * Workflow runtime endpoints (WF3). Cases nest under their workflow for create/list; a single case
 * is addressed by its own id under `/workflow-instances` (a separate static prefix so it can't be
 * captured by {@link WorkflowsController}'s `GET /workflows/:id`). Engine failures (invalid graph,
 * no transition, guard/role denied) surface as 422 from the service.
 */
@Controller()
export class WorkflowInstancesController {
  constructor(
    private readonly instances: WorkflowInstancesService,
    private readonly comments: CaseCommentsService,
    private readonly participants: CaseParticipantsService,
  ) {}

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

  /**
   * Set the case's deadline / urgency (Phase E2).
   *
   * The `/work-order` suffix is deliberate: a bare `PATCH /workflow-instances/:id` would read as
   * "patch the case", i.e. its engine state, which this endpoint pointedly cannot do — it only ever
   * writes the two work-order columns beside the instance body.
   */
  @Patch("workflow-instances/:instanceId/work-order")
  updateWorkOrder(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
    @Body() dto: UpdateWorkOrderDto,
  ): Promise<WorkflowInstanceSummary> {
    return this.instances.updateWorkOrder(ownerId, instanceId, {
      // `undefined` = leave alone, `null` = clear.
      ...(dto.dueAt !== undefined ? { dueAt: toInstant(dto.dueAt) } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    });
  }

  /** The case's comment thread — read needs `viewer` (Phase E2). */
  @Get("workflow-instances/:instanceId/comments")
  listComments(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
  ): Promise<CaseCommentRecord[]> {
    return this.comments.list(ownerId, instanceId);
  }

  /** Append a comment — needs run access (Phase E2). */
  @Post("workflow-instances/:instanceId/comments")
  addComment(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
    @Body() dto: AddCommentDto,
  ): Promise<CaseCommentRecord> {
    return this.comments.add(ownerId, instanceId, dto.body);
  }

  /** The case's cast + the caller's own effective roles — read needs `viewer` (Phase E3a). */
  @Get("workflow-instances/:instanceId/participants")
  listParticipants(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
  ): Promise<CaseCastView> {
    return this.participants.list(ownerId, instanceId);
  }

  /** Cast a workspace member into a domain role on the case — needs run access (Phase E3a). */
  @Post("workflow-instances/:instanceId/participants")
  addParticipant(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
    @Body() dto: AddParticipantDto,
  ): Promise<CaseParticipantRecord> {
    return this.participants.add(ownerId, instanceId, dto);
  }

  /** Remove someone from the cast — needs run access (Phase E3a). */
  @Delete("workflow-instances/:instanceId/participants/:participantId")
  @HttpCode(204)
  removeParticipant(
    @CurrentOwner() ownerId: string,
    @Param("instanceId") instanceId: string,
    @Param("participantId") participantId: string,
  ): Promise<void> {
    return this.participants.remove(ownerId, instanceId, participantId);
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
        // E3c (parallel track): which branch of a parallel case to move. The global ValidationPipe
        // runs with `whitelist: true`, so this only reaches us because the DTO declares it.
        token: dto.token,
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new BadRequestException((err as Error).message);
    }
  }
}
