import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { WorkOrdersController } from "./work-orders.controller.js";
import { WorkOrdersService } from "./work-orders.service.js";

/**
 * Feature module: the work-order manager (product-roadmap Phase E). Read-only here — starting,
 * advancing and assigning a case stay in {@link WorkflowsModule}, which already owns the runtime
 * access checks. Imports {@link ProjectsModule} to reuse `ProjectsService.list` as the one source
 * of "which projects may this caller see"; every repo comes from the global persistence module.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
})
export class WorkOrdersModule {}
