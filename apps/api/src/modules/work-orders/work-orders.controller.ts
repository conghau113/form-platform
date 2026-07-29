import { Controller, Get, Query } from "@nestjs/common";
import { ActiveTenant } from "../../auth/active-tenant.decorator.js";
import { CurrentOwner } from "../../auth/current-owner.decorator.js";
import { RequireFunction } from "../../auth/require-function.decorator.js";
import type { WorkflowSummary } from "../../persistence/repositories/workflow.repo.js";
// biome-ignore lint/style/useImportType: DTO class refs are read at runtime (ValidationPipe + emitDecoratorMetadata).
import { ListWorkOrdersDto } from "./dto/list-work-orders.dto.js";
import type { AssigneeOption, WorkOrderListResult } from "./work-orders.service.js";
// biome-ignore lint/style/useImportType: NestJS DI needs the runtime class reference (emitDecoratorMetadata).
import { WorkOrdersService } from "./work-orders.service.js";

const DEFAULT_PAGE_SIZE = 20;

/**
 * Work-order manager API (product-roadmap Phase E — the "Vận hành" screen).
 *
 * Gated on `workflow.run` alone, NOT on `workflow.admin`: `resolveFunctions` does not expand a
 * function's `parentCode`, so `workflow.admin` implies neither `workflow.manage` nor `workflow.run`
 * — admitting it here would open the screen to someone whose grants map to no project role at all,
 * i.e. an empty page. Tenant admins still pass: the `*` wildcard short-circuits the guard.
 */
@Controller("work-orders")
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  /** One page of the caller's cases in the active workspace. */
  @Get()
  @RequireFunction("workflow.run")
  list(
    @CurrentOwner() userId: string,
    @Query() dto: ListWorkOrdersDto,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<WorkOrderListResult> {
    const pageSize = dto.pageSize ?? DEFAULT_PAGE_SIZE;
    return this.workOrders.list(
      userId,
      {
        workflowId: dto.workflowId,
        current: dto.current,
        statusKind: dto.statusKind,
        assignee: dto.assignee,
        search: dto.q,
        page: {
          offset: ((dto.page ?? 1) - 1) * pageSize,
          limit: pageSize,
          sort: dto.sort ?? "updatedAt",
          dir: dto.dir ?? "desc",
        },
      },
      activeTenantId,
    );
  }

  /** Members of the active workspace — the assignee picker. */
  @Get("assignees")
  @RequireFunction("workflow.run")
  assignees(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<AssigneeOption[]> {
    return this.workOrders.assignees(userId, activeTenantId);
  }

  /** Workflows the caller may start a case of — the "Tạo việc" picker. */
  @Get("workflows")
  @RequireFunction("workflow.run")
  workflows(
    @CurrentOwner() userId: string,
    @ActiveTenant() activeTenantId?: string,
  ): Promise<WorkflowSummary[]> {
    return this.workOrders.runnableWorkflows(userId, activeTenantId);
  }
}
