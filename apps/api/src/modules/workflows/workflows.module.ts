import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { WorkflowsController } from "./workflows.controller.js";
import { WorkflowsService } from "./workflows.service.js";

/**
 * Feature module: workflow save/load/list/move/delete endpoints + their service (persists via
 * WorkflowRepo). Imports {@link ProjectsModule} to reuse its owner-scoped access gate.
 */
@Module({
  imports: [ProjectsModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}
